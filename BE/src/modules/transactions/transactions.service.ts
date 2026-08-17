import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisKeys, RedisService } from '../../shared/redis';
import { SYSTEM_CATEGORY } from '../categories/default-categories';
import {
  Category,
  CategoryType,
} from '../categories/entities/category.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import {
  AdjustBalanceDto,
  CreateTransactionDto,
  ListTransactionQuery,
  UpdateTransactionDto,
  decodeCursor,
  encodeCursor,
} from './dto/transaction.dto';
import { Transaction, TxType } from './entities/transaction.entity';

export interface BalanceSummary {
  currentBalance: number;
  initialBalance: number;
  totalIncome: number;
  totalExpense: number;
  since: Date | null;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly repo: Repository<Transaction>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Wallet)
    private readonly wallets: Repository<Wallet>,
    private readonly redis: RedisService,
  ) {}

  // ————————————————————— Đọc —————————————————————

  /**
   * Danh sách giao dịch, phân trang bằng cursor.
   *
   * Sắp xếp `date DESC, id DESC` và so sánh bộ đôi `(date, id)` — dùng mỗi `date` sẽ bỏ sót
   * hoặc lặp bản ghi khi nhiều giao dịch trùng ngày (rất hay gặp vì user nhập bù cả ngày).
   *
   * Giao dịch thuộc danh mục `isSystem` (điều chỉnh số dư) VẪN hiện ở đây để user thấy được
   * lịch sử, nhưng bị loại khỏi mọi thống kê và prompt AI.
   */
  async findAll(userId: string, query: ListTransactionQuery) {
    const qb = this.repo
      .createQueryBuilder('t')
      .innerJoinAndSelect('t.category', 'c')
      .where('t.userId = :userId', { userId });

    if (query.from) qb.andWhere('t.date >= :from', { from: query.from });
    if (query.to) qb.andWhere('t.date <= :to', { to: query.to });
    if (query.type) qb.andWhere('t.type = :type', { type: query.type });
    if (query.categoryId)
      qb.andWhere('t.categoryId = :categoryId', { categoryId: query.categoryId });
    if (query.minAmount !== undefined)
      qb.andWhere('t.amount >= :minAmount', { minAmount: query.minAmount });
    if (query.maxAmount !== undefined)
      qb.andWhere('t.amount <= :maxAmount', { maxAmount: query.maxAmount });
    if (query.q) qb.andWhere('t.note ILIKE :q', { q: `%${query.q}%` });
    // `&&` = giao nhau: khớp nếu có BẤT KỲ tag nào trùng
    if (query.tags?.length) qb.andWhere('t.tags && :tags', { tags: query.tags });

    if (query.cursor) {
      const c = decodeCursor(query.cursor);
      if (!c) throw new BadRequestException('Con trỏ phân trang không hợp lệ');
      qb.andWhere('(t.date, t.id) < (:cursorDate, :cursorId)', {
        cursorDate: c.date,
        cursorId: c.id,
      });
    }

    // Lấy dư 1 bản ghi để biết còn trang sau hay không, khỏi phải COUNT riêng
    const rows = await qb
      .orderBy('t.date', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .take(query.limit + 1)
      .getMany();

    const coTrangSau = rows.length > query.limit;
    const items = coTrangSau ? rows.slice(0, query.limit) : rows;
    const last = items.at(-1);

    return {
      items,
      nextCursor: coTrangSau && last ? encodeCursor(last.date, last.id) : null,
    };
  }

  async findOne(userId: string, id: string): Promise<Transaction> {
    const tx = await this.repo.findOne({
      where: { id, userId },
      relations: { category: true },
    });
    // 404 chứ không 403 — báo 403 là gián tiếp xác nhận id này có tồn tại
    if (!tx) throw new NotFoundException('Không tìm thấy giao dịch');
    return tx;
  }

  /**
   * Số tiền hiện có = `wallet.initialBalance + Σthu − Σchi`.
   *
   * **Luôn tính ra bằng `SUM()`, không lưu thành cột** (SPEC §7) — denormalize là nguồn gốc
   * của số dư lệch khỏi lịch sử.
   *
   * ⚠️ `transformer: money` KHÔNG áp dụng cho raw query, nên `SUM()` trả về **chuỗi**
   * và bắt buộc phải `Number()` thủ công. Cộng thẳng sẽ ra nối chuỗi.
   */
  async getBalance(userId: string): Promise<BalanceSummary> {
    const wallet = await this.wallets.findOneBy({ userId });
    if (!wallet) throw new NotFoundException('Không tìm thấy ví');

    const rows = await this.repo
      .createQueryBuilder('t')
      .select('t.type', 'type')
      .addSelect('SUM(t.amount)', 'total')
      .where('t.userId = :userId', { userId })
      .groupBy('t.type')
      .getRawMany<{ type: TxType; total: string }>();

    const tong = (type: TxType) =>
      Number(rows.find((r) => r.type === type)?.total ?? 0);

    const totalIncome = tong(TxType.INCOME);
    const totalExpense = tong(TxType.EXPENSE);

    return {
      currentBalance: wallet.initialBalance + totalIncome - totalExpense,
      initialBalance: wallet.initialBalance,
      totalIncome,
      totalExpense,
      since: wallet.startedAt ?? null,
    };
  }

  // ————————————————————— Ghi —————————————————————

  async create(userId: string, dto: CreateTransactionDto): Promise<Transaction> {
    const category = await this.layDanhMucHopLe(userId, dto.categoryId, dto.type);
    const walletId = await this.layViId(userId);

    const tx = await this.repo.save(
      this.repo.create({ ...dto, userId, walletId, note: dto.note ?? null }),
    );

    await this.xoaCacheThongKe(userId);
    return { ...tx, category } as Transaction;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTransactionDto,
  ): Promise<Transaction> {
    const tx = await this.findOne(userId, id);

    // Đổi danh mục thì danh mục mới phải cùng chiều tiền với giao dịch
    if (dto.categoryId && dto.categoryId !== tx.categoryId) {
      await this.layDanhMucHopLe(userId, dto.categoryId, tx.type);
    }

    await this.repo.update({ id, userId }, dto);
    await this.xoaCacheThongKe(userId);
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id); // ném 404 nếu không phải của user này
    await this.repo.delete({ id, userId });
    await this.xoaCacheThongKe(userId);
  }

  /**
   * Điều chỉnh số dư: user khai số tiền THỰC TẾ đang có, app tạo một giao dịch bù
   * đúng bằng phần chênh lệch (SPEC §3).
   *
   * Dùng khi quên nhập vài khoản khiến số app tính lệch với tiền thật. Khác với việc sửa
   * `wallet.initialBalance` — cái đó dịch chuyển TOÀN BỘ lịch sử, còn cách này chỉ bù tại
   * một thời điểm nên báo cáo các kỳ trước giữ nguyên.
   *
   * Giao dịch bù dùng danh mục `isSystem` và **bị loại khỏi mọi thống kê + prompt AI** —
   * nếu không, AI sẽ hiểu nhầm thành khoản chi thật và đưa lời khuyên sai.
   */
  async adjustBalance(userId: string, dto: AdjustBalanceDto) {
    const { currentBalance } = await this.getBalance(userId);
    const difference = dto.actualBalance - currentBalance;

    if (difference === 0) {
      return { calculatedBalance: currentBalance, actualBalance: dto.actualBalance, difference: 0, transaction: null };
    }

    // Chênh dương = app tính THIẾU (có khoản thu quên nhập) → bù bằng giao dịch thu
    const type = difference > 0 ? TxType.INCOME : TxType.EXPENSE;

    /*
     * ⚠️ Phải lọc theo CẢ TÊN, không chỉ `isSystem: true`.
     *
     * Từ khi có tính năng công nợ bạn bè, mỗi chiều tiền có HAI danh mục hệ thống
     * ("Điều chỉnh số dư" và "Trả hộ bạn bè"). Chỉ lọc `isSystem` thì `findOneBy` trả về
     * cái nào tùy thứ tự DB — bút toán bù số dư có thể rơi vào "Trả hộ bạn bè" và làm hỏng
     * số liệu công nợ.
     */
    const category = await this.categories.findOneBy({
      userId,
      isSystem: true,
      name: SYSTEM_CATEGORY.DIEU_CHINH_SO_DU,
      type: this.sangCategoryType(type),
    });
    if (!category) {
      throw new NotFoundException(
        `Không tìm thấy danh mục hệ thống "${SYSTEM_CATEGORY.DIEU_CHINH_SO_DU}"`,
      );
    }

    const tx = await this.repo.save(
      this.repo.create({
        userId,
        walletId: await this.layViId(userId),
        categoryId: category.id,
        type,
        amount: Math.abs(difference),
        date: new Date(),
        note: dto.note ?? 'Điều chỉnh số dư',
        tags: [],
      }),
    );

    await this.xoaCacheThongKe(userId);

    return {
      calculatedBalance: currentBalance,
      actualBalance: dto.actualBalance,
      difference,
      transaction: { ...tx, category } as Transaction,
    };
  }

  // ————————————————————— Nội bộ —————————————————————

  /** Danh mục phải thuộc user, không phải danh mục hệ thống, và cùng chiều tiền với giao dịch */
  private async layDanhMucHopLe(
    userId: string,
    categoryId: string,
    type: TxType,
  ): Promise<Category> {
    const category = await this.categories.findOneBy({ id: categoryId, userId });
    if (!category) throw new NotFoundException('Không tìm thấy danh mục');

    if (category.isSystem) {
      throw new BadRequestException(
        'Không thể ghi giao dịch vào danh mục hệ thống. Dùng POST /transactions/adjust-balance.',
      );
    }

    const mongDoi = this.sangCategoryType(type);
    if (category.type !== mongDoi) {
      throw new BadRequestException(
        `Danh mục "${category.name}" là danh mục ${category.type === CategoryType.INCOME ? 'thu' : 'chi'}, không khớp với giao dịch ${type === TxType.INCOME ? 'thu' : 'chi'}`,
      );
    }

    return category;
  }

  /**
   * `TxType` và `CategoryType` có giá trị chuỗi giống nhau nhưng là HAI enum khác nhau —
   * TypeScript không cho gán chéo. Tách thành một hàm để chỗ nào cần chuyển cũng đi qua đây.
   */
  private sangCategoryType(type: TxType): CategoryType {
    return type === TxType.INCOME ? CategoryType.INCOME : CategoryType.EXPENSE;
  }

  private async layViId(userId: string): Promise<string> {
    const wallet = await this.wallets.findOneBy({ userId });
    if (!wallet) throw new NotFoundException('Không tìm thấy ví');
    return wallet.id;
  }

  /** Mọi thay đổi giao dịch đều làm sai số liệu đã cache — phải xóa ngay */
  private async xoaCacheThongKe(userId: string): Promise<void> {
    await this.redis.delByPrefix(RedisKeys.statsPrefix(userId));
  }
}
