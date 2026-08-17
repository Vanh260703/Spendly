import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DateRange,
  PeriodKind,
  rangeKey,
  resolvePeriod,
  shiftRange,
} from '../../common/utils/period';
import { RedisKeys, RedisService, RedisTtl } from '../../shared/redis';
import { FriendsService } from '../friends/friends.service';
import { Goal, GoalStatus } from '../goals/entities/goal.entity';
import { Transaction, TxType } from '../transactions/entities/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { User } from '../users/entities/user.entity';
import { RangeQuery } from './dto/stats.dto';

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Goal)
    private readonly goals: Repository<Goal>,
    private readonly transactions: TransactionsService,
    private readonly friends: FriendsService,
    private readonly redis: RedisService,
  ) {}

  // ————————————————————— Số dư —————————————————————

  /**
   * Các con số của dashboard, và ý nghĩa KHÁC NHAU của từng cái:
   *
   * | | Tiền có trong ví? | Tiêu được không? |
   * |---|---|---|
   * | `currentBalance` | có — đây là tiền thật | — |
   * | `committedToGoals` | có, nhưng đã gắn nhãn mục tiêu (SPEC §4.5) | không nên |
   * | `owedByMe` | có, nhưng đã có chủ — bạn đang nợ người ta | không |
   * | `owedToMe` | **KHÔNG** — người khác đang giữ, sẽ về | chưa |
   * | `freeToSpend` | `currentBalance − committedToGoals − owedByMe` | có |
   *
   * ⚠️ `owedToMe` KHÔNG cộng vào `freeToSpend`: tiền đó chưa về, tiêu trước là tiêu khống.
   * Và nó cũng không phải bước đầu của theo dõi tài sản ròng (SPEC §7 đã loại `Asset`) — nó
   * là hệ quả của những khoản chi đã ghi, không phải một bảng cân đối tài sản.
   */
  async getBalance(userId: string) {
    const [balance, row, congNo] = await Promise.all([
      this.transactions.getBalance(userId),
      this.goals
        .createQueryBuilder('g')
        .select('COALESCE(SUM(g.currentAmount), 0)', 'total')
        .where('g.userId = :userId AND g.status = :status', {
          userId,
          status: GoalStatus.ACTIVE,
        })
        .getRawOne<{ total: string }>(),
      this.friends.tongCongNo(userId),
    ]);

    const committedToGoals = Number(row?.total ?? 0);

    return {
      ...balance,
      committedToGoals,
      owedToMe: congNo.owedToMe,
      owedByMe: congNo.owedByMe,
      freeToSpend: balance.currentBalance - committedToGoals - congNo.owedByMe,
    };
  }

  // ————————————————————— Tổng hợp một kỳ —————————————————————

  async getSummary(userId: string, query: RangeQuery) {
    const { range, kind } = await this.giaiMaKhoang(userId, query);

    return this.redis.remember(
      RedisKeys.stats(userId, 'summary', rangeKey(range)),
      RedisTtl.STATS,
      async () => {
        const [hienTai, kyTruoc, ba] = await Promise.all([
          this.tongTheoLoai(userId, range),
          this.tongTheoLoai(userId, shiftRange(range, 1, kind)),
          Promise.all(
            [1, 2, 3].map((n) => this.tongTheoLoai(userId, shiftRange(range, n, kind))),
          ),
        ]);

        const byKind = await this.tongTheoKind(userId, range);
        const tongChi = hienTai.expense;
        const tyLe = (v: number) => (tongChi > 0 ? Number((v / tongChi).toFixed(4)) : 0);

        const tbBaKy = ba.reduce((s, k) => s + k.expense, 0) / 3;

        return {
          from: range.start,
          to: range.end,
          income: hienTai.income,
          expense: hienTai.expense,
          net: hienTai.income - hienTai.expense,
          byKind,
          // Tỉ trọng need/want/saving để đối chiếu khung 50/30/20
          kindRatio: {
            need: tyLe(byKind.need),
            want: tyLe(byKind.want),
            saving: tyLe(byKind.saving),
          },
          comparison: {
            previousPeriodExpense: kyTruoc.expense,
            changePercent:
              kyTruoc.expense > 0
                ? Number(((tongChi - kyTruoc.expense) / kyTruoc.expense).toFixed(4))
                : null,
            avg3PeriodsExpense: Math.round(tbBaKy),
          },
        };
      },
    );
  }

  // ————————————————————— Theo danh mục (đầu vào chính của AI) —————————————————————

  /**
   * Thống kê theo danh mục — trả **cả tần suất**, không chỉ tổng tiền.
   *
   * Đây là dữ liệu giúp AI phân biệt "1 lần 500k" với "10 lần 50k": hai vấn đề khác nhau
   * và cách cắt cũng khác (giảm mức chi mỗi lần vs giảm số lần). Thiếu `count` thì AI chỉ
   * nói được chung chung. Xem SPEC §4.7.
   */
  async getByCategory(userId: string, query: RangeQuery & { type: TxType }) {
    const { range, kind } = await this.giaiMaKhoang(userId, query);

    return this.redis.remember(
      RedisKeys.stats(userId, `by-category:${query.type}`, rangeKey(range)),
      RedisTtl.STATS,
      async () => {
        const rows = await this.baseQuery(userId, range)
          .select('c.id', 'id')
          .addSelect('c.name', 'name')
          .addSelect('c.icon', 'icon')
          .addSelect('c.color', 'color')
          .addSelect('c.kind', 'kind')
          .addSelect('SUM(t.amount)', 'total')
          .addSelect('COUNT(*)', 'count')
          .addSelect('AVG(t.amount)', 'average')
          .andWhere('t.type = :type', { type: query.type })
          .groupBy('c.id')
          .addGroupBy('c.name')
          .addGroupBy('c.icon')
          .addGroupBy('c.color')
          .addGroupBy('c.kind')
          .orderBy('SUM(t.amount)', 'DESC')
          .getRawMany<Record<string, string>>();

        // Trung bình 3 kỳ trước, theo TỪNG danh mục — để biết khoản này đang tăng hay
        // chỉ là thói quen cố hữu
        const truoc = await this.tongTheoDanhMucNhieuKy(userId, range, kind, query.type, 3);

        const { income, expense } = await this.tongTheoLoai(userId, range);
        const mauSo = query.type === TxType.EXPENSE ? expense : income;

        return rows.map((r) => {
          const total = Number(r.total);
          const tbTruoc = truoc.get(r.id) ?? 0;

          return {
            category: {
              id: r.id,
              name: r.name,
              icon: r.icon,
              color: r.color,
              kind: r.kind,
            },
            total,
            count: Number(r.count),
            average: Math.round(Number(r.average)),
            percentOfExpense: mauSo > 0 ? Number((total / mauSo).toFixed(4)) : 0,
            percentOfIncome: income > 0 ? Number((total / income).toFixed(4)) : 0,
            // null = chưa đủ dữ liệu để so sánh; AI phải nói "chưa đủ dữ liệu" thay vì suy diễn
            vsPrevious3Avg:
              tbTruoc > 0 ? Number(((total - tbTruoc) / tbTruoc).toFixed(4)) : null,
          };
        });
      },
    );
  }

  // ————————————————————— Xu hướng —————————————————————

  async getTrend(
    userId: string,
    query: RangeQuery & { groupBy: 'day' | 'week' | 'month' },
  ) {
    const { range } = await this.giaiMaKhoang(userId, query);
    const user = await this.users.findOneByOrFail({ id: userId });

    return this.redis.remember(
      RedisKeys.stats(userId, `trend:${query.groupBy}`, rangeKey(range)),
      RedisTtl.STATS,
      async () => {
        // Gom nhóm theo múi giờ của user, không phải UTC — nếu không, giao dịch lúc 7h sáng
        // sẽ bị xếp vào ngày hôm trước
        const rows = await this.baseQuery(userId, range)
          .select(
            `to_char(date_trunc('${query.groupBy}', t.date AT TIME ZONE :tz), 'YYYY-MM-DD')`,
            'bucket',
          )
          .addSelect('t.type', 'type')
          .addSelect('SUM(t.amount)', 'total')
          .setParameter('tz', user.timezone)
          .groupBy('bucket')
          .addGroupBy('t.type')
          .orderBy('bucket', 'ASC')
          .getRawMany<{ bucket: string; type: TxType; total: string }>();

        const gom = new Map<string, { income: number; expense: number }>();
        for (const r of rows) {
          const o = gom.get(r.bucket) ?? { income: 0, expense: 0 };
          o[r.type === TxType.INCOME ? 'income' : 'expense'] = Number(r.total);
          gom.set(r.bucket, o);
        }

        return [...gom.entries()].map(([bucket, v]) => ({ bucket, ...v }));
      },
    );
  }

  // ————————————————————— Lịch nhiệt —————————————————————

  async getCalendar(userId: string, month?: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    const range = month
      ? {
          start: new Date(`${month}-01T00:00:00.000Z`),
          end: new Date(
            new Date(`${month}-01T00:00:00.000Z`).setUTCMonth(
              new Date(`${month}-01T00:00:00.000Z`).getUTCMonth() + 1,
            ) - 1,
          ),
        }
      : resolvePeriod('month', {
          timezone: user.timezone,
          monthStartDay: user.monthStartDay,
        });

    return this.redis.remember(
      RedisKeys.stats(userId, 'calendar', rangeKey(range)),
      RedisTtl.STATS,
      async () => {
        const rows = await this.baseQuery(userId, range)
          .select(`to_char(t.date AT TIME ZONE :tz, 'YYYY-MM-DD')`, 'date')
          .addSelect('SUM(t.amount)', 'expense')
          .addSelect('COUNT(*)', 'count')
          .andWhere('t.type = :type', { type: TxType.EXPENSE })
          .setParameter('tz', user.timezone)
          .groupBy('date')
          .orderBy('date', 'ASC')
          .getRawMany<{ date: string; expense: string; count: string }>();

        const days = rows.map((r) => ({
          date: r.date,
          expense: Number(r.expense),
          count: Number(r.count),
        }));

        return {
          days,
          // FE dùng để chuẩn hóa độ đậm màu heatmap
          max: days.reduce((m, d) => Math.max(m, d.expense), 0),
        };
      },
    );
  }

  // ————————————————————— Nội bộ —————————————————————

  /**
   * Query nền cho MỌI thống kê.
   *
   * ⚠️ **Luôn loại danh mục `isSystem`** (giao dịch bù của "Điều chỉnh số dư"). Quên lọc là
   * một lần điều chỉnh 2tr sẽ bị tính thành khoản chi thật, và AI sẽ khuyên bạn "cắt giảm"
   * một thứ không hề tồn tại.
   */
  private baseQuery(userId: string, range: DateRange) {
    return this.txRepo
      .createQueryBuilder('t')
      .innerJoin('t.category', 'c')
      .where('t.userId = :userId', { userId })
      .andWhere('t.date BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      })
      .andWhere('c.isSystem = false');
  }

  /**
   * ⚠️ `transformer: money` KHÔNG áp dụng cho raw query — `SUM()` trả về **chuỗi**,
   * bắt buộc `Number()` thủ công, nếu không mọi phép cộng sẽ thành nối chuỗi.
   */
  private async tongTheoLoai(userId: string, range: DateRange) {
    const rows = await this.baseQuery(userId, range)
      .select('t.type', 'type')
      .addSelect('SUM(t.amount)', 'total')
      .groupBy('t.type')
      .getRawMany<{ type: TxType; total: string }>();

    const lay = (type: TxType) => Number(rows.find((r) => r.type === type)?.total ?? 0);
    return { income: lay(TxType.INCOME), expense: lay(TxType.EXPENSE) };
  }

  /** Chi tiêu chia theo need / want / saving — đầu vào cho khung 50/30/20 */
  private async tongTheoKind(userId: string, range: DateRange) {
    const rows = await this.baseQuery(userId, range)
      .select('c.kind', 'kind')
      .addSelect('SUM(t.amount)', 'total')
      .andWhere('t.type = :type', { type: TxType.EXPENSE })
      .groupBy('c.kind')
      .getRawMany<{ kind: string; total: string }>();

    const lay = (k: string) => Number(rows.find((r) => r.kind === k)?.total ?? 0);
    return { need: lay('need'), want: lay('want'), saving: lay('saving') };
  }

  /** Trung bình `soKy` kỳ TRƯỚC kỳ hiện tại, theo từng danh mục */
  private async tongTheoDanhMucNhieuKy(
    userId: string,
    range: DateRange,
    kind: PeriodKind,
    type: TxType,
    soKy: number,
  ): Promise<Map<string, number>> {
    const dau = shiftRange(range, soKy, kind).start;
    const cuoi = shiftRange(range, 1, kind).end;

    const rows = await this.baseQuery(userId, { start: dau, end: cuoi })
      .select('c.id', 'id')
      .addSelect('SUM(t.amount)', 'total')
      .andWhere('t.type = :type', { type })
      .groupBy('c.id')
      .getRawMany<{ id: string; total: string }>();

    return new Map(rows.map((r) => [r.id, Number(r.total) / soKy]));
  }

  /** Đổi query của client thành khoảng thời gian thật, theo múi giờ + `monthStartDay` của user */
  private async giaiMaKhoang(
    userId: string,
    query: RangeQuery,
  ): Promise<{ range: DateRange; kind: PeriodKind }> {
    if (query.from && query.to) {
      /**
       * Khoảng tùy chọn: so sánh kỳ trước bằng cách dịch lùi đúng độ dài khoảng đó.
       *
       * `periodKind` cho phép chỗ gọi nói rõ đây là kỳ tháng — khi đó dịch lùi theo THÁNG
       * chứ không theo số mili giây, để tháng 2 (28 ngày) không lệch so với tháng 1.
       * Báo cáo chạy theo lịch cần điều này, nếu không con số "so với kỳ trước" sẽ sai.
       */
      return {
        range: { start: query.from, end: query.to },
        kind: (query as { periodKind?: PeriodKind }).periodKind ?? 'week',
      };
    }

    const user = await this.users.findOneByOrFail({ id: userId });
    const kind = query.period ?? 'month';

    return {
      range: resolvePeriod(kind, {
        timezone: user.timezone,
        monthStartDay: user.monthStartDay,
      }),
      kind,
    };
  }
}
