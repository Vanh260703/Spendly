import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { RedisKeys, RedisService } from '../../shared/redis';
import { SYSTEM_CATEGORY } from '../categories/default-categories';
import { Category, CategoryType } from '../categories/entities/category.entity';
import { Transaction, TxType } from '../transactions/entities/transaction.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
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
    @InjectRepository(Wallet) private readonly wallets: Repository<Wallet>,
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
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
        .leftJoinAndSelect('e.category', 'category')
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
          categoryName: e.category?.name ?? null,
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

    return { contact: this.toContactDto(contact, congNo), history: lichSu };
  }

  // ═══════════════════════ Chia bill ═══════════════════════

  /**
   * Ghi một lần chi chung.
   *
   * Bạn trả → sinh tối đa 3 giao dịch (thực ăn · mời · cho mượn).
   * Người khác trả → **không giao dịch nào** (tiền chưa rời ví bạn).
   *
   * Toàn bộ nằm trong MỘT transaction DB: nửa chừng lỗi mà đã kịp tạo 2/3 giao dịch thì số
   * dư lệch vĩnh viễn.
   */
  async createSharedExpense(userId: string, dto: CreateSharedExpenseDto) {
    const contactIds = [
      ...dto.shares.map((s) => s.contactId).filter((x): x is string => !!x),
      ...(dto.payerContactId ? [dto.payerContactId] : []),
    ];
    await this.kiemTraContactThuocUser(userId, contactIds);

    const category = await this.layDanhMucChi(userId, dto.categoryId);
    const treatCategory = dto.treatCategoryId
      ? await this.layDanhMucChi(userId, dto.treatCategoryId)
      : null;

    const phanCuaToi = dto.shares.find((s) => s.contactId === null)?.amount ?? 0;
    const choMuon = dto.shares
      .filter((s) => s.contactId !== null)
      .reduce((t, s) => t + s.amount, 0);

    const saved = await this.dataSource.transaction(async (em) => {
      const toiTra = dto.payerContactId === null;

      // Người khác trả hộ → tiền chưa rời ví bạn → KHÔNG giao dịch nào.
      // Khoản chi của bạn chỉ xuất hiện lúc bạn tất toán (SPEC §4.6).
      const txMine = toiTra
        ? await this.taoGiaoDich(em, userId, {
            categoryId: category.id,
            amount: phanCuaToi - dto.treatAmount,
            date: dto.date,
            note: dto.note ?? 'Phần của tôi',
            type: TxType.EXPENSE,
          })
        : null;

      const txTreat =
        toiTra && treatCategory
          ? await this.taoGiaoDich(em, userId, {
              categoryId: treatCategory.id,
              amount: dto.treatAmount,
              date: dto.date,
              note: dto.note ? `Mời — ${dto.note}` : 'Mời bạn bè',
              type: TxType.EXPENSE,
            })
          : null;

      const txLent = toiTra
        ? await this.taoGiaoDich(em, userId, {
            categoryId: (await this.layDanhMucTraHo(userId, TxType.EXPENSE)).id,
            amount: choMuon,
            date: dto.date,
            note: dto.note ? `Trả hộ — ${dto.note}` : 'Trả hộ bạn bè',
            type: TxType.EXPENSE,
          })
        : null;

      const expense = await em.save(
        em.create(SharedExpense, {
          userId,
          payerContactId: dto.payerContactId,
          totalAmount: dto.totalAmount,
          date: dto.date,
          note: dto.note ?? null,
          categoryId: category.id,
          treatAmount: dto.treatAmount,
          treatCategoryId: treatCategory?.id ?? null,
          transactionIdMine: txMine?.id ?? null,
          transactionIdTreat: txTreat?.id ?? null,
          transactionIdLent: txLent?.id ?? null,
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

      return expense;
    });

    await this.xoaCacheThongKe(userId);
    return this.getSharedExpense(userId, saved.id);
  }

  async listSharedExpenses(userId: string, dto: ListSharedExpensesDto) {
    const qb = this.expenses
      .createQueryBuilder('e')
      .where('e.userId = :userId', { userId })
      .leftJoinAndSelect('e.shares', 'shares')
      .leftJoinAndSelect('shares.contact', 'shareContact')
      .leftJoinAndSelect('e.category', 'category')
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
      relations: { shares: { contact: true }, category: true, payer: true },
    });
    if (!e) throw new NotFoundException('Không tìm thấy khoản chi chung');
    return this.toSharedExpenseDto(e);
  }

  /**
   * Xóa một lần chi chung — **xóa kèm cả 3 giao dịch** đã sinh, trong cùng một transaction DB.
   *
   * Bỏ sót một giao dịch là số dư lệch vĩnh viễn mà không ai biết vì sao. FK của các
   * `transactionId*` là `RESTRICT` nên phải xóa `SharedExpense` TRƯỚC rồi mới xóa giao dịch.
   */
  async deleteSharedExpense(userId: string, id: string): Promise<void> {
    const e = await this.expenses.findOneBy({ id, userId });
    if (!e) throw new NotFoundException('Không tìm thấy khoản chi chung');

    const txIds = [e.transactionIdMine, e.transactionIdTreat, e.transactionIdLent].filter(
      (x): x is string => !!x,
    );

    await this.dataSource.transaction(async (em) => {
      await em.delete(SharedExpenseShare, { sharedExpenseId: e.id });
      await em.delete(SharedExpense, { id: e.id });
      if (txIds.length) await em.delete(Transaction, { id: In(txIds) });
    });

    await this.xoaCacheThongKe(userId);
  }

  // ═══════════════════════ Tất toán ═══════════════════════

  /**
   * Ghi một lần trả tiền tất toán. Luôn có tiền di chuyển → luôn sinh đúng một giao dịch.
   *
   * | Chiều | Giao dịch | Danh mục |
   * |---|---|---|
   * | Họ trả bạn | thu | "Trả hộ bạn bè" (`isSystem`) — không thổi phồng thu nhập |
   * | Bạn trả họ | chi | danh mục THẬT — đây mới là lúc bạn thực sự tiêu |
   */
  async createSettlement(userId: string, dto: CreateSettlementDto) {
    await this.kiemTraContactThuocUser(userId, [dto.contactId]);

    const hoTraToi = dto.direction === SettlementDirection.THEY_PAID_ME;

    const category = hoTraToi
      ? await this.layDanhMucTraHo(userId, TxType.INCOME)
      : await this.layDanhMucChi(userId, dto.categoryId!);

    const saved = await this.dataSource.transaction(async (em) => {
      const tx = await this.taoGiaoDich(em, userId, {
        categoryId: category.id,
        amount: dto.amount,
        date: dto.date,
        note: dto.note ?? (hoTraToi ? 'Được trả lại' : 'Trả lại bạn bè'),
        type: hoTraToi ? TxType.INCOME : TxType.EXPENSE,
      });

      return em.save(
        em.create(Settlement, {
          userId,
          contactId: dto.contactId,
          direction: dto.direction,
          amount: dto.amount,
          date: dto.date,
          note: dto.note ?? null,
          transactionId: tx!.id,
        }),
      );
    });

    await this.xoaCacheThongKe(userId);
    return saved;
  }

  async deleteSettlement(userId: string, id: string): Promise<void> {
    const s = await this.settlements.findOneBy({ id, userId });
    if (!s) throw new NotFoundException('Không tìm thấy lần tất toán');

    await this.dataSource.transaction(async (em) => {
      await em.delete(Settlement, { id: s.id });
      await em.delete(Transaction, { id: s.transactionId });
    });

    await this.xoaCacheThongKe(userId);
  }

  // ═══════════════════════ Dùng cho module khác ═══════════════════════

  /**
   * Tổng công nợ hai chiều — `StatsService` gọi để dựng thẻ số dư.
   *
   * `owedToMe` nằm NGOÀI ví (người khác đang giữ), `owedByMe` vẫn trong ví nhưng đã có chủ
   * nên phải trừ khỏi `freeToSpend`.
   */
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
    args: { categoryId: string; amount: number; date: Date; note: string; type: TxType },
  ): Promise<Transaction | null> {
    if (args.amount <= 0) return null;

    const wallet = await em.findOneBy(Wallet, { userId });
    if (!wallet) throw new NotFoundException('Không tìm thấy ví');

    return em.save(
      em.create(Transaction, {
        userId,
        walletId: wallet.id,
        categoryId: args.categoryId,
        type: args.type,
        amount: args.amount,
        date: args.date,
        note: args.note,
        tags: [],
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
      treatAmount: e.treatAmount,
      iPaid: e.payerContactId === null,
      payer: e.payer ? { id: e.payer.id, name: e.payer.name, color: e.payer.color } : null,
      category: e.category ? { id: e.category.id, name: e.category.name } : null,
      shares: (e.shares ?? []).map((s) => ({
        contactId: s.contactId,
        name: s.contact?.name ?? 'Tôi',
        amount: s.amount,
      })),
    };
  }

  /** Giao dịch mới sinh làm sai số liệu đã cache — phải xóa ngay */
  private async xoaCacheThongKe(userId: string): Promise<void> {
    await this.redis.delByPrefix(RedisKeys.statsPrefix(userId));
  }
}
