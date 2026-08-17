import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import {
  DateRange,
  PeriodKind,
  resolvePeriod,
  shiftRange,
} from '../../common/utils/period';
import { RedisKeys, RedisService } from '../../shared/redis';
import { Category } from '../categories/entities/category.entity';
import { Transaction, TxType } from '../transactions/entities/transaction.entity';
import { User } from '../users/entities/user.entity';
import {
  BudgetHistoryQuery,
  CreateBudgetDto,
  UpdateBudgetDto,
} from './dto/budget.dto';
import { BudgetPeriodResult } from './entities/budget-period-result.entity';
import { Budget, BudgetPeriod } from './entities/budget.entity';

@Injectable()
export class BudgetsService {
  constructor(
    @InjectRepository(Budget) private readonly repo: Repository<Budget>,
    @InjectRepository(BudgetPeriodResult)
    private readonly results: Repository<BudgetPeriodResult>,
    @InjectRepository(Transaction) private readonly txRepo: Repository<Transaction>,
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly redis: RedisService,
  ) {}

  // ————————————————————— CRUD —————————————————————

  async create(userId: string, dto: CreateBudgetDto): Promise<Budget> {
    if (dto.categoryId) {
      const cat = await this.categories.findOneBy({ id: dto.categoryId, userId });
      if (!cat) throw new NotFoundException('Không tìm thấy danh mục');
      if (cat.isSystem) {
        throw new ConflictException('Không thể đặt ngân sách cho danh mục hệ thống');
      }

      const daCo = await this.repo.findOneBy({
        userId,
        categoryId: dto.categoryId,
        isActive: true,
      });
      if (daCo) {
        throw new ConflictException(
          `Danh mục "${cat.name}" đã có ngân sách đang chạy. Hãy sửa ngân sách đó thay vì tạo mới.`,
        );
      }
    }

    return this.repo.save(
      this.repo.create({
        ...dto,
        userId,
        categoryId: dto.categoryId ?? null,
        startDate: dto.startDate ?? new Date(),
      }),
    );
  }

  async update(userId: string, id: string, dto: UpdateBudgetDto): Promise<Budget> {
    await this.findOne(userId, id);
    await this.repo.update({ id, userId }, dto);
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id);
    // Lịch sử trong `budget_period_results` KHÔNG mất (FK SET NULL) — đó chính là
    // lý do bảng đó tồn tại
    await this.repo.delete({ id, userId });
  }

  async findOne(userId: string, id: string): Promise<Budget> {
    const b = await this.repo.findOne({
      where: { id, userId },
      relations: { category: true },
    });
    if (!b) throw new NotFoundException('Không tìm thấy ngân sách');
    return b;
  }

  // ————————————————————— Kỳ hiện tại —————————————————————

  /** Danh sách ngân sách kèm số đã tiêu của kỳ ĐANG chạy — FE không phải tự tính */
  async findAllWithProgress(userId: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    const budgets = await this.repo.find({
      where: { userId, isActive: true },
      relations: { category: true },
      order: { createdAt: 'ASC' },
    });

    return Promise.all(
      budgets.map(async (b) => {
        const range = this.kyHienTai(b, user);
        const [spent, rolloverIn] = await Promise.all([
          this.tinhDaTieu(userId, b.categoryId ?? null, range),
          this.layRolloverIn(b),
        ]);
        return {
          budget: b,
          calc: { spent, rolloverIn, periodStart: range.start, periodEnd: range.end },
        };
      }),
    );
  }

  async history(userId: string, query: BudgetHistoryQuery) {
    const qb = this.results
      .createQueryBuilder('r')
      .where('r.userId = :userId', { userId });

    if (query.from) qb.andWhere('r.periodStart >= :from', { from: query.from });
    if (query.to) qb.andWhere('r.periodEnd <= :to', { to: query.to });
    if (query.categoryId)
      qb.andWhere('r.categoryId = :categoryId', { categoryId: query.categoryId });

    return qb.orderBy('r.periodStart', 'DESC').take(query.limit).getMany();
  }

  // ————————————————————— Job chốt kỳ —————————————————————

  /**
   * Chốt các kỳ ĐÃ KẾT THÚC mà chưa có bản ghi kết quả.
   *
   * Chạy **mỗi ngày** chứ không phải cuối tháng: `monthStartDay` khác nhau giữa các user
   * nên "cuối kỳ" không phải một mốc chung.
   *
   * **Idempotent** nhờ `UNIQUE(budgetId, periodStart)` — chạy hai lần, hoặc chạy trễ vài
   * ngày do máy tắt, đều không tạo bản ghi trùng. Bắt buộc với job ghi dữ liệu tài chính.
   */
  async closeDuePeriods(now = new Date()): Promise<number> {
    const budgets = await this.repo.find({
      where: { isActive: true },
      relations: { category: true, user: true },
    });

    let daChot = 0;

    for (const b of budgets) {
      const user = b.user ?? (await this.users.findOneByOrFail({ id: b.userId }));
      const kyHienTai = this.kyHienTai(b, user, now);
      // Kỳ gần nhất đã đóng = kỳ ngay trước kỳ đang chạy
      const kyTruoc = shiftRange(kyHienTai, 1, this.periodKind(b.period));

      // Chưa tới ngày bắt đầu áp dụng thì chưa có gì để chốt
      if (kyTruoc.end < b.startDate) continue;

      const daTonTai = await this.results.findOneBy({
        budgetId: b.id,
        periodStart: kyTruoc.start,
      });
      if (daTonTai) continue;

      const spent = await this.tinhDaTieu(b.userId, b.categoryId ?? null, kyTruoc);
      const rolloverIn = await this.layRolloverIn(b, kyTruoc);
      const effectiveAmount = b.amount + rolloverIn;

      await this.results.save(
        this.results.create({
          userId: b.userId,
          budgetId: b.id,
          categoryId: b.categoryId ?? null,
          // Snapshot TÊN dạng text — danh mục có thể bị đổi tên/xóa sau này
          categoryName: b.category?.name ?? null,
          period: b.period,
          periodStart: kyTruoc.start,
          periodEnd: kyTruoc.end,
          amount: b.amount,
          rolloverIn,
          effectiveAmount,
          spent,
          rolloverOut: b.rollover
            ? this.chanTran(effectiveAmount - spent, b.amount * b.rolloverCapRatio)
            : 0,
        }),
      );
      daChot++;
    }

    return daChot;
  }

  // ————————————————————— Nội bộ —————————————————————

  private periodKind(p: BudgetPeriod): PeriodKind {
    return p === BudgetPeriod.WEEKLY ? 'week' : 'month';
  }

  private kyHienTai(b: Budget, user: User, now = new Date()): DateRange {
    return resolvePeriod(this.periodKind(b.period), {
      timezone: user.timezone,
      monthStartDay: user.monthStartDay,
      now,
    });
  }

  /**
   * Chênh lệch mang sang từ kỳ TRƯỚC — đọc `rolloverOut` của bản ghi kết quả gần nhất.
   *
   * Có dấu: dương = kỳ trước dư, **âm = kỳ trước vượt**. Chỉ cộng khi dư mà không trừ khi
   * vượt sẽ biến ngân sách thành phần thưởng một chiều và mất tác dụng kiểm soát (SPEC §4.4).
   */
  private async layRolloverIn(b: Budget, truocKy?: DateRange): Promise<number> {
    if (!b.rollover) return 0;

    const truoc = await this.results.findOne({
      where: {
        budgetId: b.id,
        ...(truocKy ? { periodStart: LessThan(truocKy.start) } : {}),
      },
      order: { periodStart: 'DESC' },
    });

    return truoc?.rolloverOut ?? 0;
  }

  /** Chặn trong khoảng ±cap để tiết kiệm nhiều kỳ liền không đẩy hạn mức phồng vô hạn */
  private chanTran(value: number, cap: number): number {
    return Math.round(Math.max(-cap, Math.min(cap, value)));
  }

  /**
   * Số đã tiêu trong kỳ. `categoryId = null` → ngân sách tổng, tính toàn bộ chi tiêu.
   *
   * ⚠️ Luôn loại danh mục `isSystem` (giao dịch bù điều chỉnh số dư), và `SUM()` từ raw
   * query trả về **chuỗi** nên phải `Number()`.
   */
  private async tinhDaTieu(
    userId: string,
    categoryId: string | null,
    range: DateRange,
  ): Promise<number> {
    const qb = this.txRepo
      .createQueryBuilder('t')
      .innerJoin('t.category', 'c')
      .select('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.userId = :userId', { userId })
      .andWhere('t.type = :type', { type: TxType.EXPENSE })
      .andWhere('c.isSystem = false')
      .andWhere('t.date BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      });

    if (categoryId) qb.andWhere('t.categoryId = :categoryId', { categoryId });

    const row = await qb.getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  /** Ngân sách đổi thì số liệu thống kê đã cache cũng không còn đúng */
  async xoaCache(userId: string): Promise<void> {
    await this.redis.delByPrefix(RedisKeys.statsPrefix(userId));
  }
}
