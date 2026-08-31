import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TZDate } from '@date-fns/tz';
import { IsNull, Repository } from 'typeorm';
import { RedisKeys, RedisService } from '../../shared/redis';
import { SYSTEM_CATEGORY } from '../categories/default-categories';
import {
  Category,
  CategoryType,
} from '../categories/entities/category.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
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
  /** Tổng số dư mọi tài khoản ngân hàng đã liên kết — do ngân hàng cấp */
  currentBalance: number;
  totalIncome: number;
  totalExpense: number;
  /** Lần cuối nhận webhook — im lặng quá lâu là dấu hiệu liên kết SePay hỏng */
  lastSyncedAt: Date | null;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly repo: Repository<Transaction>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(BankAccount)
    private readonly bankAccounts: Repository<BankAccount>,
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

    // Nới `yyyy-mm-dd` thành trọn ngày theo múi giờ người dùng — xem `bienNgay()`
    if (query.from) qb.andWhere('t.date >= :from', { from: this.bienNgay(query.from, 'dau') });
    if (query.to) qb.andWhere('t.date <= :to', { to: this.bienNgay(query.to, 'cuoi') });
    if (query.unreviewed) qb.andWhere('t.reviewedAt IS NULL');
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
   * Số dư = **con số NGÂN HÀNG báo về**, không phải app tự cộng trừ.
   *
   * Mỗi webhook SePay mang theo `accumulated` — số dư thật sau giao dịch — và nó được chép
   * thẳng vào `BankAccount.currentBalance`. App không tự tính lại.
   *
   * ⚠️ Đây KHÔNG mâu thuẫn với quy tắc "không lưu cột balance" (SPEC §7). Quy tắc đó chặn
   * việc app tự cộng dồn rồi lệch khỏi lịch sử của chính nó. Ở đây con số do ngân hàng cấp;
   * tự cộng trừ mới là cách sai, vì ta không bao giờ thấy hết mọi biến động (phí, lãi,
   * giao dịch phát sinh trước khi liên kết).
   *
   * `totalIncome`/`totalExpense` vẫn tính bằng `SUM()` vì chúng là tổng của KỲ, không phải
   * số dư. ⚠️ `transformer: money` không áp dụng cho raw query — `SUM()` trả về **chuỗi**,
   * bắt buộc `Number()` thủ công.
   */
  async getBalance(userId: string): Promise<BalanceSummary> {
    const [accounts, rows] = await Promise.all([
      this.bankAccounts.find({ where: { userId } }),
      this.repo
        .createQueryBuilder('t')
        .select('t.type', 'type')
        .addSelect('SUM(t.amount)', 'total')
        .where('t.userId = :userId', { userId })
        .groupBy('t.type')
        .getRawMany<{ type: TxType; total: string }>(),
    ]);

    const tong = (type: TxType) => Number(rows.find((r) => r.type === type)?.total ?? 0);

    return {
      currentBalance: accounts.reduce((t, a) => t + a.currentBalance, 0),
      totalIncome: tong(TxType.INCOME),
      totalExpense: tong(TxType.EXPENSE),
      lastSyncedAt:
        accounts
          .map((a) => a.lastSyncedAt)
          .filter((d): d is Date => !!d)
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    };
  }

  /** Bao nhiêu khoản chưa xét — giao diện cần con số này mà không muốn tải cả danh sách */
  async demChuaXet(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, reviewedAt: IsNull() } });
  }

  // ————————————————————— Ghi —————————————————————


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

    // `reviewed` là cờ ở API nhưng là MỐC THỜI GIAN ở DB — đổi ngay tại đây để chỗ khác
    // không phải biết hai cách gọi cho cùng một thứ
    const { reviewed, ...conLai } = dto;
    if (reviewed !== undefined) {
      Object.assign(conLai, { reviewedAt: reviewed ? new Date() : null });
    }

    await this.repo.update({ id, userId }, conLai);
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


  /**
   * `"2026-08-26"` → mốc đầu hoặc cuối ngày đó **theo múi giờ người dùng**.
   *
   * ⚠️ Đây là chỗ hai lỗi kinh điển gặp nhau:
   *
   * - **Quên cuối ngày**: `to = 2026-08-26T00:00Z` loại bỏ mọi giao dịch trong chính ngày
   *   26 vì tất cả đều muộn hơn 00:00. Bộ lọc "hôm nay" luôn trả về rỗng.
   * - **Quên múi giờ**: nửa đêm ở VN là 17:00 hôm trước theo UTC. Lấy biên theo UTC thì
   *   giao dịch lúc 2h sáng bị xếp sang ngày hôm trước.
   */
  private bienNgay(ngay: string, phia: 'dau' | 'cuoi'): Date {
    const tz = process.env.TIMEZONE ?? 'Asia/Ho_Chi_Minh';
    const [y, m, d] = ngay.split('-').map(Number);
    return phia === 'dau'
      ? new Date(new TZDate(y, m - 1, d, 0, 0, 0, 0, tz).getTime())
      : new Date(new TZDate(y, m - 1, d, 23, 59, 59, 999, tz).getTime());
  }

  /** Mọi thay đổi giao dịch đều làm sai số liệu đã cache — phải xóa ngay */
  private async xoaCacheThongKe(userId: string): Promise<void> {
    await this.redis.delByPrefix(RedisKeys.statsPrefix(userId));
  }
}
