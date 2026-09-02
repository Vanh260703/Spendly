import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { SYSTEM_CATEGORY } from '../categories/default-categories';
import { Category, CategoryType } from '../categories/entities/category.entity';
import { Transaction, TxType } from '../transactions/entities/transaction.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import {
  ContactDto,
  CreateContactDto,
  CreateSettlementDto,
  CreateSharedExpenseDto,
  ListContactsDto,
  ListSharedExpensesDto,
  UpdateContactDto,
} from './dto/friends.dto';
import { Contact } from './entities/contact.entity';
import { Settlement, SettlementDirection } from './entities/settlement.entity';
import { SharedExpense, SharedExpenseShare } from './entities/shared-expense.entity';

/** Màu avatar gán vòng tròn cho người mới — để danh sách dài vẫn phân biệt được bằng mắt */
const MAU_AVATAR = [
  '#f97316', '#3b82f6', '#8b5cf6', '#14b8a6', '#ef4444',
  '#6366f1', '#ec4899', '#a855f7', '#0891b2', '#eab308',
];

@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(Contact) private readonly contacts: Repository<Contact>,
    @InjectRepository(SharedExpense) private readonly expenses: Repository<SharedExpense>,
    @InjectRepository(Settlement) private readonly settlements: Repository<Settlement>,
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(BankAccount) private readonly bankAccounts: Repository<BankAccount>,
    private readonly dataSource: DataSource,
  ) {}

  // ═══════════════════════ Công nợ — MỘT chỗ duy nhất ═══════════════════════

  /**
   * Công nợ của từng người: **dương = họ nợ bạn**, **âm = bạn nợ họ**.
   *
   * ⚠️ **Đây là NƠI DUY NHẤT được phép viết công thức này.** Bốn số hạng cộng trừ đan nhau;
   * rải dấu +/− ra nhiều query là chắc chắn có chỗ sai dấu, mà sai dấu công nợ thì không có
   * cách nào tự phát hiện — con số vẫn "trông hợp lý".
   *
   * ```
   * X nợ bạn = Σ share(X)   trong bill BẠN trả      ← họ mượn bạn
   *          − Σ share(bạn) trong bill X trả        ← bạn mượn họ
   *          − Σ settlement THEY_PAID_ME của X      ← họ trả lại
   *          + Σ settlement I_PAID_THEM  của X      ← bạn trả lại
   * ```
   *
   * ⚠️ `SUM()` qua raw query trả về **chuỗi** (driver `pg`), `transformer: money` KHÔNG áp
   * dụng — bắt buộc `Number()` thủ công, nếu không sẽ thành nối chuỗi.
   */
  private async tinhCongNo(userId: string): Promise<Map<string, number>> {
    const rows = await this.dataSource.query<{ contactId: string; balance: string }[]>(
      `
      SELECT "contactId", SUM(delta) AS balance FROM (
        -- Họ mượn bạn: phần của HỌ trong hóa đơn BẠN trả
        SELECT s."contactId" AS "contactId", s.amount AS delta
        FROM shared_expense_shares s
        JOIN shared_expenses e ON e.id = s."sharedExpenseId"
        WHERE e."userId" = $1 AND e."payerContactId" IS NULL AND s."contactId" IS NOT NULL

        UNION ALL

        -- Bạn mượn họ: phần của BẠN (contactId NULL) trong hóa đơn HỌ trả
        SELECT e."payerContactId" AS "contactId", -s.amount AS delta
        FROM shared_expense_shares s
        JOIN shared_expenses e ON e.id = s."sharedExpenseId"
        WHERE e."userId" = $1 AND e."payerContactId" IS NOT NULL AND s."contactId" IS NULL

        UNION ALL

        -- Tất toán hai chiều
        SELECT st."contactId" AS "contactId",
               CASE WHEN st.direction = 'they_paid_me' THEN -st.amount ELSE st.amount END AS delta
        FROM settlements st
        WHERE st."userId" = $1
      ) t
      WHERE "contactId" IS NOT NULL
      GROUP BY "contactId"
      `,
      [userId],
    );

    return new Map(rows.map((r) => [r.contactId, Number(r.balance)]));
  }

  /** Lần cuối có phát sinh với từng người — để biết ai lâu rồi chưa tất toán */
  private async layHoatDongCuoi(userId: string): Promise<Map<string, Date>> {
    const rows = await this.dataSource.query<{ contactId: string; last: Date }[]>(
      `
      SELECT "contactId", MAX(d) AS last FROM (
        SELECT COALESCE(s."contactId", e."payerContactId") AS "contactId", e.date AS d
        FROM shared_expense_shares s
        JOIN shared_expenses e ON e.id = s."sharedExpenseId"
        WHERE e."userId" = $1
        UNION ALL
        SELECT st."contactId", st.date FROM settlements st WHERE st."userId" = $1
      ) t
      WHERE "contactId" IS NOT NULL
      GROUP BY "contactId"
      `,
      [userId],
    );
    return new Map(rows.map((r) => [r.contactId, r.last]));
  }

  // ═══════════════════════ Danh bạ ═══════════════════════

  async listContacts(userId: string, dto: ListContactsDto) {
    const qb = this.contacts
      .createQueryBuilder('c')
      .where('c.userId = :userId', { userId });

    if (!dto.includeArchived) qb.andWhere('c.isArchived = false');
    if (dto.q) {
      qb.andWhere('c.nameNormalized LIKE :q', { q: `%${dto.q.trim().toLowerCase()}%` });
    }

    const [rows, congNo, hoatDong] = await Promise.all([
      qb.orderBy('c.name', 'ASC').getMany(),
      this.tinhCongNo(userId),
      this.layHoatDongCuoi(userId),
    ]);

    return rows.map((c) => ({
      ...this.toContactDto(c, congNo.get(c.id) ?? 0),
      lastActivityAt: hoatDong.get(c.id) ?? null,
    }));
  }

  /**
   * Thêm người vào danh bạ.
   *
   * **Tên đã tồn tại → trả về người đã có, KHÔNG báo lỗi 409.** Ô chọn người trong form chia
   * bill dựa hẳn vào hành vi này để "gõ tên mới là tạo tại chỗ" — bắt user xử lý lỗi trùng
   * giữa lúc đang ghi một bữa ăn là cách nhanh nhất khiến họ bỏ không ghi nữa.
   */
  async createContact(userId: string, dto: CreateContactDto): Promise<ContactDto> {
    const nameNormalized = this.chuanHoaTen(dto.name);

    const daCo = await this.contacts.findOneBy({ userId, nameNormalized });
    if (daCo) {
      // Người đã lưu trữ mà được gõ lại tên → coi như muốn dùng lại, bỏ lưu trữ
      if (daCo.isArchived) {
        daCo.isArchived = false;
        await this.contacts.save(daCo);
      }
      const congNo = await this.tinhCongNo(userId);
      return this.toContactDto(daCo, congNo.get(daCo.id) ?? 0);
    }

    const soNguoi = await this.contacts.countBy({ userId });
    const saved = await this.contacts.save(
      this.contacts.create({
        userId,
        name: dto.name.trim(),
        nameNormalized,
        phone: dto.phone ?? null,
        note: dto.note ?? null,
        color: dto.color ?? MAU_AVATAR[soNguoi % MAU_AVATAR.length],
      }),
    );

    return this.toContactDto(saved, 0);
  }

  async updateContact(userId: string, id: string, dto: UpdateContactDto): Promise<ContactDto> {
    const contact = await this.layContact(userId, id);

    if (dto.name !== undefined) {
      const nameNormalized = this.chuanHoaTen(dto.name);
      const trung = await this.contacts.findOneBy({ userId, nameNormalized });
      if (trung && trung.id !== id) {
        throw new ConflictException(`Đã có người tên "${trung.name}" trong danh bạ`);
      }
      contact.name = dto.name.trim();
      contact.nameNormalized = nameNormalized;
    }

    if (dto.phone !== undefined) contact.phone = dto.phone;
    if (dto.qrImage !== undefined) contact.qrImage = dto.qrImage;
    if (dto.note !== undefined) contact.note = dto.note;
    if (dto.color !== undefined) contact.color = dto.color;
    if (dto.isArchived !== undefined) contact.isArchived = dto.isArchived;

    const saved = await this.contacts.save(contact);
    const congNo = await this.tinhCongNo(userId);
    return this.toContactDto(saved, congNo.get(id) ?? 0);
  }

  /**
   * Xóa người khỏi danh bạ.
   *
   * **Chặn khi công nợ ≠ 0** — xóa mất người còn nợ là mất luôn số tiền đó khỏi tầm mắt.
   * Muốn ẩn mà giữ lịch sử thì dùng `isArchived`.
   */
  async deleteContact(userId: string, id: string): Promise<void> {
    const contact = await this.layContact(userId, id);
    const congNo = (await this.tinhCongNo(userId)).get(id) ?? 0;

    if (congNo !== 0) {
      const chieu = congNo > 0 ? `${contact.name} còn nợ bạn` : `Bạn còn nợ ${contact.name}`;
      throw new ConflictException(
        `${chieu} ${Math.abs(congNo).toLocaleString('vi-VN')}₫. ` +
          'Hãy tất toán trước khi xóa, hoặc lưu trữ để ẩn khỏi danh sách.',
      );
    }

    await this.contacts.remove(contact);
  }

  /** Chi tiết một người: công nợ + toàn bộ lịch sử phát sinh, mới nhất trước */
  async getContactDetail(userId: string, id: string) {
    const contact = await this.layContact(userId, id);
    const congNo = (await this.tinhCongNo(userId)).get(id) ?? 0;

    const [bills, tatToan] = await Promise.all([
      this.expenses
        .createQueryBuilder('e')
        .innerJoin('shared_expense_shares', 's', 's."sharedExpenseId" = e.id')
        .where('e.userId = :userId', { userId })
        .andWhere('(s."contactId" = :id OR e."payerContactId" = :id)', { id })
        .leftJoinAndSelect('e.shares', 'shares')
        .distinct(true)
        .orderBy('e.date', 'DESC')
        .getMany(),
      this.settlements.find({ where: { userId, contactId: id }, order: { date: 'DESC' } }),
    ]);

    const lichSu = [
      ...bills.map((e) => {
        const toiTra = e.payerContactId === null;
        const phanHo = e.shares.find((s) => s.contactId === id)?.amount ?? 0;
        const phanToi = e.shares.find((s) => s.contactId === null)?.amount ?? 0;
        return {
          kind: 'shared_expense' as const,
          id: e.id,
          date: e.date,
          note: e.note,
          totalAmount: e.totalAmount,
          iPaid: toiTra,
          myShare: phanToi,
          theirShare: phanHo,
          // Tác động lên công nợ — đúng hai số hạng đầu của công thức ở `tinhCongNo()`
          effect: toiTra ? phanHo : -phanToi,
        };
      }),
      ...tatToan.map((s) => ({
        kind: 'settlement' as const,
        id: s.id,
        date: s.date,
        note: s.note,
        direction: s.direction,
        amount: s.amount,
        effect: s.direction === SettlementDirection.THEY_PAID_ME ? -s.amount : s.amount,
      })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      // Chỉ chi tiết mới kèm ảnh QR — danh sách thì không, xem giải thích ở entity
      contact: { ...this.toContactDto(contact, congNo), qrImage: contact.qrImage ?? null },
      history: lichSu,
    };
  }

  // ═══════════════════════ Chia bill ═══════════════════════

  /**
   * Ghi một lần chi chung.
   *
   * ⚠️ **KHÔNG tạo, không sửa, không xóa bất kỳ `Transaction` nào.**
   *
   * `transactions` là bản sao nguyên vẹn của sao kê ngân hàng. Trước đây hàm này tách giao
   * dịch gốc 1.000.000₫ thành ba dòng con — sổ trong app không còn khớp sao kê thật, và mất
   * khả năng đối chiếu khi có tranh chấp. Giờ giao dịch gốc **giữ nguyên**, việc chia chỉ
   * được ghi vào `shared_expenses` + `shared_expense_shares`.
   *
   * Số dư vẫn đúng vì nó lấy từ `accumulated` của ngân hàng, không phụ thuộc bảng này.
   * Phần "cho mượn" được trừ khỏi tổng chi ở tầng thống kê (xem `StatsService`).
   */
  async createSharedExpense(userId: string, dto: CreateSharedExpenseDto) {
    const contactIds = [
      ...dto.shares.map((s) => s.contactId).filter((x): x is string => !!x),
      ...(dto.payerContactId ? [dto.payerContactId] : []),
    ];
    await this.kiemTraContactThuocUser(userId, contactIds);

    const goc = dto.transactionId
      ? await this.layGiaoDichDeChia(userId, dto.transactionId)
      : null;

    const tongHoaDon = goc ? goc.amount : dto.totalAmount!;
    const ngay = goc ? goc.date : dto.date!;

    /*
     * Bất biến quan trọng nhất của cả tính năng. Kiểm ở đây chứ không ở Zod, vì khi gắn với
     * giao dịch ngân hàng thì số tiền lấy từ GIAO DỊCH — Zod không nhìn thấy con số đó.
     */
    const tongCacPhan = dto.shares.reduce((t, s) => t + s.amount, 0);
    if (tongCacPhan !== tongHoaDon) {
      throw new BadRequestException(
        `Tổng các phần (${tongCacPhan.toLocaleString('vi-VN')}₫) phải bằng ` +
          `hóa đơn (${tongHoaDon.toLocaleString('vi-VN')}₫)`,
      );
    }

    const saved = await this.dataSource.transaction(async (em) => {
      const expense = await em.save(
        em.create(SharedExpense, {
          userId,
          payerContactId: dto.payerContactId,
          transactionId: goc?.id ?? null,
          totalAmount: tongHoaDon,
          date: ngay,
          note: dto.note ?? null,
        }),
      );

      await em.save(
        dto.shares.map((s) =>
          em.create(SharedExpenseShare, {
            sharedExpenseId: expense.id,
            contactId: s.contactId,
            amount: s.amount,
          }),
        ),
      );

      // Chia xong tức là đã xét — không để giao dịch nằm lại trong hàng chờ.
      // Đây là thay đổi DUY NHẤT chạm vào `transactions`, và nó không đụng tới tiền.
      if (goc) {
        await em.update(Transaction, { id: goc.id }, { reviewedAt: new Date() });
      }

      return expense;
    });
    return this.getSharedExpense(userId, saved.id);
  }

  /**
   * Giao dịch ngân hàng đủ điều kiện để chia.
   *
   * Chặn chia hai lần bằng khóa duy nhất `transactionId` ở DB; ở đây chặn sớm để báo lỗi
   * đọc được thay vì để DB ném lỗi ràng buộc.
   */
  private async layGiaoDichDeChia(userId: string, id: string): Promise<Transaction> {
    const tx = await this.dataSource.manager.findOneBy(Transaction, { id, userId });
    if (!tx) throw new NotFoundException('Không tìm thấy giao dịch');
    if (tx.type !== TxType.EXPENSE) {
      throw new BadRequestException('Chỉ chia được giao dịch CHI');
    }

    const daChia = await this.expenses.findOneBy({ transactionId: id });
    if (daChia) {
      throw new ConflictException('Giao dịch này đã được chia cho bạn bè rồi');
    }
    return tx;
  }

  async listSharedExpenses(userId: string, dto: ListSharedExpensesDto) {
    const qb = this.expenses
      .createQueryBuilder('e')
      .where('e.userId = :userId', { userId })
      .leftJoinAndSelect('e.shares', 'shares')
      .leftJoinAndSelect('shares.contact', 'shareContact')
      .leftJoinAndSelect('e.payer', 'payer')
      .orderBy('e.date', 'DESC')
      .addOrderBy('e.createdAt', 'DESC')
      .take(dto.limit);

    if (dto.contactId) {
      qb.andWhere(
        '(e."payerContactId" = :cid OR EXISTS (SELECT 1 FROM shared_expense_shares x ' +
          'WHERE x."sharedExpenseId" = e.id AND x."contactId" = :cid))',
        { cid: dto.contactId },
      );
    }

    return (await qb.getMany()).map((e) => this.toSharedExpenseDto(e));
  }

  async getSharedExpense(userId: string, id: string) {
    const e = await this.expenses.findOne({
      where: { id, userId },
      relations: { shares: { contact: true }, payer: true },
    });
    if (!e) throw new NotFoundException('Không tìm thấy khoản chi chung');
    return this.toSharedExpenseDto(e);
  }

  /**
   * Xóa một lần chia bill.
   *
   * Chỉ xóa bản ghi công nợ — **không đụng tới giao dịch ngân hàng**, vì việc chia vốn đã
   * không sửa gì ở đó. Giao dịch được trả về hàng chờ để bạn xét lại.
   */
  async deleteSharedExpense(userId: string, id: string): Promise<void> {
    const e = await this.expenses.findOneBy({ id, userId });
    if (!e) throw new NotFoundException('Không tìm thấy khoản chi chung');

    await this.dataSource.transaction(async (em) => {
      await em.delete(SharedExpenseShare, { sharedExpenseId: e.id });
      await em.delete(SharedExpense, { id: e.id });
      if (e.transactionId) {
        await em.update(Transaction, { id: e.transactionId }, { reviewedAt: null });
      }
    });
  }

  // ═══════════════════════ Tất toán ═══════════════════════

  /**
   * Ghi một lần trả nợ.
   *
   * ⚠️ **Không tạo `Transaction`.** Trả qua chuyển khoản thì SePay sẽ mang giao dịch đó về
   * như mọi giao dịch khác; tạo thêm ở đây là đếm hai lần. Trả tiền mặt thì vốn không có gì
   * để ngân hàng báo. Hàm này chỉ ghi **công nợ đã dịch chuyển bao nhiêu**.
   *
   * Cho phép trả **từng phần** và trả **dư** (công nợ đổi dấu) — đời thật vẫn xảy ra, chặn
   * chỉ làm người dùng phải nói dối dữ liệu.
   */
  async createSettlement(userId: string, dto: CreateSettlementDto) {
    await this.kiemTraContactThuocUser(userId, [dto.contactId]);

    const saved = await this.settlements.save(
      this.settlements.create({
        userId,
        contactId: dto.contactId,
        direction: dto.direction,
        amount: dto.amount,
        date: dto.date,
        note: dto.note ?? null,
      }),
    );
    return saved;
  }

  async deleteSettlement(userId: string, id: string): Promise<void> {
    const s = await this.settlements.findOneBy({ id, userId });
    if (!s) throw new NotFoundException('Không tìm thấy lần trả nợ');

    // Không có giao dịch nào để xóa kèm — việc ghi nợ vốn không tạo giao dịch
    await this.settlements.remove(s);
  }

  // ═══════════════════════ Dùng cho module khác ═══════════════════════

  /**
   * Tổng công nợ hai chiều — `StatsService` gọi để dựng thẻ số dư.
   *
   * `owedToMe` nằm NGOÀI ví (người khác đang giữ), `owedByMe` vẫn trong ví nhưng đã có chủ
   * nên phải trừ khỏi `freeToSpend`.
   */
  /**
   * Tổng tiền BẠN đã ứng cho người khác trong một khoảng — để `StatsService` trừ ra khỏi
   * tổng chi.
   *
   * Chỉ tính hóa đơn BẠN trả (`payerContactId IS NULL`) và chỉ phần của NGƯỜI KHÁC. Phần
   * của bạn trong cùng hóa đơn là tiền bạn tiêu thật, không được trừ.
   *
   * ⚠️ `SUM()` qua raw query trả về CHUỖI — bắt buộc `Number()` thủ công.
   */
  async tongChoMuonTrongKy(userId: string, tu: Date, den: Date): Promise<number> {
    const row = await this.dataSource.query<{ total: string | null }[]>(
      `
      SELECT SUM(s.amount) AS total
      FROM shared_expense_shares s
      JOIN shared_expenses e ON e.id = s."sharedExpenseId"
      WHERE e."userId" = $1
        AND e."payerContactId" IS NULL
        AND s."contactId" IS NOT NULL
        AND e.date BETWEEN $2 AND $3
      `,
      [userId, tu, den],
    );
    return Number(row[0]?.total ?? 0);
  }

  /**
   * Tổng tiền bạn bè ĐÃ TRẢ LẠI bạn trong một khoảng — để `StatsService` trừ khỏi thu nhập.
   *
   * Tiền đó vào tài khoản qua chuyển khoản nên SePay mang về như một khoản THU, nhưng nó
   * không phải thu nhập: đó là tiền của chính bạn quay về sau khi đã ứng ra. Không trừ thì
   * mỗi lần bạn bè trả nợ, "thu nhập trong kỳ" lại phồng lên.
   *
   * ⚠️ Chỉ trừ chiều `THEY_PAID_ME`. Chiều ngược lại (bạn trả nợ họ) là tiền RỜI tài khoản
   * và **đúng là bạn tiêu thật** — lúc đó mới là lúc bạn trả cho bữa ăn đã ăn từ trước.
   *
   * ⚠️ `SUM()` qua raw query trả về CHUỖI — bắt buộc `Number()` thủ công.
   */
  async tongTraLaiTrongKy(userId: string, tu: Date, den: Date): Promise<number> {
    const row = await this.dataSource.query<{ total: string | null }[]>(
      `
      SELECT SUM(amount) AS total FROM settlements
      WHERE "userId" = $1 AND direction = 'they_paid_me' AND date BETWEEN $2 AND $3
      `,
      [userId, tu, den],
    );
    return Number(row[0]?.total ?? 0);
  }

  async tongCongNo(userId: string): Promise<{ owedToMe: number; owedByMe: number }> {
    let owedToMe = 0;
    let owedByMe = 0;
    for (const so of (await this.tinhCongNo(userId)).values()) {
      if (so > 0) owedToMe += so;
      else owedByMe += -so;
    }
    return { owedToMe, owedByMe };
  }

  // ═══════════════════════ Nội bộ ═══════════════════════

  /**
   * ⚠️ Cố ý CHỈ `trim` + `toLowerCase`, KHÔNG bỏ dấu.
   *
   * "Tuấn" và "Tuan" có thể là hai người thật. Tự động gộp thì công nợ của hai người dồn làm
   * một và rất khó lần ra đã sai từ đâu — gộp phải là thao tác có chủ đích.
   */
  private chuanHoaTen(name: string): string {
    return name.trim().toLowerCase();
  }

  private async layContact(userId: string, id: string): Promise<Contact> {
    const c = await this.contacts.findOneBy({ id, userId });
    if (!c) throw new NotFoundException('Không tìm thấy người này trong danh bạ');
    return c;
  }

  private async kiemTraContactThuocUser(userId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const duy = [...new Set(ids)];
    const dem = await this.contacts.countBy({ id: In(duy), userId });
    if (dem !== duy.length) {
      throw new NotFoundException('Có người không nằm trong danh bạ của bạn');
    }
  }

  /** Danh mục chi THẬT do user chọn — chặn danh mục hệ thống và sai chiều tiền */
  private async layDanhMucChi(userId: string, categoryId: string): Promise<Category> {
    const c = await this.categories.findOneBy({ id: categoryId, userId });
    if (!c) throw new NotFoundException('Không tìm thấy danh mục');
    if (c.isSystem) {
      throw new BadRequestException('Không thể chọn danh mục hệ thống cho khoản chi này');
    }
    if (c.type !== CategoryType.EXPENSE) {
      throw new BadRequestException(`Danh mục "${c.name}" là danh mục thu, không phải chi`);
    }
    return c;
  }

  /** Chỗ hứng mặc định khi không ai chọn danh mục */
  private async layDanhMucMacDinh(userId: string): Promise<Category> {
    const c = await this.categories.findOneBy({
      userId,
      isSystem: true,
      name: SYSTEM_CATEGORY.CHUA_PHAN_LOAI,
      type: CategoryType.EXPENSE,
    });
    if (!c) {
      throw new NotFoundException(
        `Không tìm thấy danh mục hệ thống "${SYSTEM_CATEGORY.CHUA_PHAN_LOAI}"`,
      );
    }
    return c;
  }

  /** Danh mục hệ thống "Trả hộ bạn bè" — phải lọc CẢ TÊN vì mỗi chiều có 2 danh mục hệ thống */
  private async layDanhMucTraHo(userId: string, type: TxType): Promise<Category> {
    const c = await this.categories.findOneBy({
      userId,
      isSystem: true,
      name: SYSTEM_CATEGORY.TRA_HO_BAN_BE,
      type: type === TxType.INCOME ? CategoryType.INCOME : CategoryType.EXPENSE,
    });
    if (!c) {
      throw new NotFoundException(
        `Không tìm thấy danh mục hệ thống "${SYSTEM_CATEGORY.TRA_HO_BAN_BE}"`,
      );
    }
    return c;
  }

  /**
   * Tạo giao dịch ở tầng repository.
   *
   * ⚠️ Không đi qua `TransactionsService.create()` được: nó **chặn** ghi vào danh mục
   * `isSystem` — chốt chặn cố ý, không được nới ra chỉ để tiện cho chỗ này.
   *
   * Trả `null` khi số tiền = 0: bill mà bạn không ăn miếng nào, hoặc mời trọn phần của mình.
   * Đừng bao giờ tạo giao dịch 0₫.
   */
  private async taoGiaoDich(
    em: EntityManager,
    userId: string,
    args: {
      categoryId: string;
      amount: number;
      date: Date;
      note: string;
      type: TxType;
      /** Tài khoản của giao dịch gốc — dòng con phải nằm cùng chỗ với dòng nó tách ra */
      bankAccountId?: string;
    },
  ): Promise<Transaction | null> {
    if (args.amount <= 0) return null;

    const bankAccountId =
      args.bankAccountId ??
      (await em.findOneBy(BankAccount, { userId }))?.id;
    if (!bankAccountId) throw new NotFoundException('Chưa liên kết tài khoản ngân hàng nào');

    return em.save(
      em.create(Transaction, {
        userId,
        bankAccountId,
        categoryId: args.categoryId,
        type: args.type,
        amount: args.amount,
        date: args.date,
        note: args.note,
        tags: [],
        /*
         * Dòng do app tự sinh (tách hóa đơn, tất toán) KHÔNG vào hàng chờ.
         *
         * Hàng chờ trả lời câu "khoản nào tôi chưa xét xem có phần trả hộ không?" — mà
         * chính những dòng này là KẾT QUẢ của việc xét đó. Để chúng vào hàng chờ thì chia
         * một hóa đơn xong con số chưa-xét lại tăng lên, và người dùng sẽ học cách bỏ qua nó.
         */
        reviewedAt: new Date(),
      }),
    );
  }

  private toContactDto(c: Contact, balance: number): ContactDto {
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      note: c.note,
      color: c.color,
      isArchived: c.isArchived,
      balance,
    };
  }

  private toSharedExpenseDto(e: SharedExpense) {
    return {
      id: e.id,
      date: e.date,
      note: e.note,
      totalAmount: e.totalAmount,
      iPaid: e.payerContactId === null,
      transactionId: e.transactionId ?? null,
      payer: e.payer ? { id: e.payer.id, name: e.payer.name, color: e.payer.color } : null,
      shares: (e.shares ?? []).map((s) => ({
        contactId: s.contactId,
        name: s.contact?.name ?? 'Tôi',
        amount: s.amount,
      })),
    };
  }

}
