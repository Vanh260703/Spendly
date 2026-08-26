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
import { SYSTEM_CATEGORY } from '../categories/default-categories';
import { FriendsService } from '../friends/friends.service';
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
    private readonly transactions: TransactionsService,
    private readonly friends: FriendsService,
    private readonly redis: RedisService,
  ) {}

  // ————————————————————— Số dư —————————————————————

  /**
   * Ba con số của màn hình chính.
   *
   * | | Tiền có trong tài khoản? |
   * |---|---|
   * | `currentBalance` | có — số dư ngân hàng báo về |
   * | `owedByMe` | có, nhưng đã có chủ: bạn đang nợ người ta |
   * | `owedToMe` | **KHÔNG** — người khác đang giữ, sẽ về |
   * | `freeToSpend` | `currentBalance − owedByMe` |
   *
   * ⚠️ `owedToMe` KHÔNG cộng vào `freeToSpend`: tiền đó chưa về tài khoản, tiêu trước là
   * tiêu khống.
   */
  async getBalance(userId: string) {
    const [balance, congNo] = await Promise.all([
      this.transactions.getBalance(userId),
      this.friends.tongCongNo(userId),
    ]);

    return {
      ...balance,
      owedToMe: congNo.owedToMe,
      owedByMe: congNo.owedByMe,
      freeToSpend: balance.currentBalance - congNo.owedByMe,
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

        const tongChi = hienTai.expense;

        const tbBaKy = ba.reduce((s, k) => s + k.expense, 0) / 3;

        return {
          from: range.start,
          to: range.end,
          income: hienTai.income,
          expense: hienTai.expense,
          net: hienTai.income - hienTai.expense,
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

  // ————————————————————— Theo danh mục —————————————————————

  /**
   * Thống kê theo danh mục — trả **cả tần suất**, không chỉ tổng tiền.
   *
   * `count` giúp phân biệt "1 lần 500k" với "10 lần 50k" — hai chuyện khác hẳn nhau và
   * cách xử lý cũng khác (giảm mức mỗi lần vs giảm số lần).
   */
  async getByCategory(userId: string, query: RangeQuery & { type: TxType }) {
    const { range, kind } = await this.giaiMaKhoang(userId, query);

    return this.redis.remember(
      RedisKeys.stats(userId, `by-category:${query.type}`, rangeKey(range)),
      RedisTtl.STATS,
      async () => {
        const rows = await this.baseQuery(userId, range, true)
          .select('c.id', 'id')
          .addSelect('c.name', 'name')
          .addSelect('c.icon', 'icon')
          .addSelect('c.color', 'color')
          .addSelect('SUM(t.amount)', 'total')
          .addSelect('COUNT(*)', 'count')
          .addSelect('AVG(t.amount)', 'average')
          .andWhere('t.type = :type', { type: query.type })
          .groupBy('c.id')
          .addGroupBy('c.name')
          .addGroupBy('c.icon')
          .addGroupBy('c.color')
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
   * Query nền cho mọi thống kê.
   *
   * ⚠️ **Hai danh mục hệ thống phải bị đối xử KHÁC NHAU** — gộp chung là sai một trong hai:
   *
   * | Danh mục | Vào TỔNG chi? | Vào biểu đồ theo danh mục? |
   * |---|---|---|
   * | `Trả hộ bạn bè` | ❌ không — tiền cho mượn, sẽ về | ❌ |
   * | `Chưa phân loại` | ✅ **CÓ** — tiền đã đi thật | ❌ lát bánh vô nghĩa |
   *
   * Lọc `isSystem = false` cho cả hai (như phiên bản trước) làm khoản chưa phân loại **biến
   * mất khỏi tổng chi**. Với dữ liệu từ ngân hàng thì mọi giao dịch đều BẮT ĐẦU ở trạng thái
   * chưa phân loại, nên tổng chi sẽ gần bằng 0 cho tới khi gán hết nhãn — con số sai mà
   * trông vẫn hợp lý.
   *
   * @param boQuaChuaPhanLoai bật khi vẽ biểu đồ theo danh mục
   */
  private baseQuery(userId: string, range: DateRange, boQuaChuaPhanLoai = false) {
    const qb = this.txRepo
      .createQueryBuilder('t')
      .innerJoin('t.category', 'c')
      .where('t.userId = :userId', { userId })
      .andWhere('t.date BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      })
      // Tiền cho mượn không phải tiền tiêu — không bao giờ tính, ở bất kỳ thống kê nào
      .andWhere('c.name != :traHo', { traHo: SYSTEM_CATEGORY.TRA_HO_BAN_BE });

    if (boQuaChuaPhanLoai) {
      qb.andWhere('c.name != :chuaPhanLoai', {
        chuaPhanLoai: SYSTEM_CATEGORY.CHUA_PHAN_LOAI,
      });
    }
    return qb;
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
