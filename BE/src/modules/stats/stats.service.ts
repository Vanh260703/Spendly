import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TZDate } from '@date-fns/tz';
import { Repository } from 'typeorm';
import {
  DateRange,
  PeriodKind,
  rangeKey,
  resolvePeriod,
  shiftRange,
} from '../../common/utils/period';
import { SYSTEM_CATEGORY } from '../categories/default-categories';
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
  ) {}

  // ————————————————————— Số dư —————————————————————

  /**
   * Các con số của màn hình chính.
   *
   * | | Tiền có trong tài khoản? |
   * |---|---|
   * | `currentBalance` | có — số dư ngân hàng báo về |
   * | `committedToGoals` | có, nhưng đã gắn nhãn mục tiêu |
   * | `owedByMe` | có, nhưng đã có chủ: bạn đang nợ người ta |
   * | `owedToMe` | **KHÔNG** — người khác đang giữ, sẽ về |
   * | `freeToSpend` | `currentBalance − committedToGoals − owedByMe` |
   *
   * ⚠️ `owedToMe` KHÔNG cộng vào `freeToSpend`: tiền đó chưa về tài khoản, tiêu trước là
   * tiêu khống.
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

    const kyTruocRange = shiftRange(range, 1, kind);

    const [hienTai, kyTruoc, ba, choMuon, traLai, somNhat] = await Promise.all([
      this.tongTheoLoai(userId, range),
      this.tongTheoLoai(userId, kyTruocRange),
      Promise.all(
        [1, 2, 3].map((n) => this.tongTheoLoai(userId, shiftRange(range, n, kind))),
      ),
      this.friends.tongChoMuonTrongKy(userId, range.start, range.end),
      this.friends.tongTraLaiTrongKy(userId, range.start, range.end),
      this.ngayGiaoDichSomNhat(userId),
    ]);

    /*
     * ⚠️ Kỳ trước có bị CẮT CỤT không?
     *
     * SePay chỉ ghi giao dịch kể từ lúc liên kết tài khoản, không lấy ngược lịch sử. Nên
     * kỳ trước có thể chỉ chứa vài ngày cuối trong khi kỳ này đã chạy trọn — so hai cái
     * đó rồi kết luận "chi nhiều hơn 550%" là **bịa**: phần lớn chênh lệch đến từ việc
     * kỳ trước thiếu dữ liệu, không phải từ hành vi tiêu tiền.
     *
     * Đây đúng loại con số sai mà trông vẫn hợp lý, nên thà không so còn hơn so sai.
     */
    const kyTruocThieuDuLieu = !!somNhat && somNhat > kyTruocRange.start;

    /*
     * ⚠️ Trừ phần CHO MƯỢN ra khỏi tổng chi.
     *
     * `transactions` giữ nguyên con số ngân hàng báo (1.000.000₫ cho bữa ăn 4 người),
     * nên nếu cộng thẳng thì tổng chi tính cả 750.000₫ mà bạn bè sẽ trả lại — bạn nhìn
     * vào sẽ tưởng mình tiêu gấp mấy lần thực tế.
     *
     * Trước đây việc này do một danh mục hệ thống lo, nhưng nó đòi phải cắt nhỏ giao
     * dịch ngân hàng. Trừ ở tầng thống kê thì sổ ngân hàng còn nguyên vẹn.
     */
    const tongChi = Math.max(0, hienTai.expense - choMuon);

    /*
     * ⚠️ Trừ tiền TRẢ LẠI ra khỏi thu nhập — đối xứng với việc trừ tiền cho mượn khỏi
     * chi tiêu.
     *
     * Bạn bè chuyển khoản trả nợ thì ngân hàng báo về như một khoản THU, nhưng đó là
     * tiền của chính bạn quay về. Không trừ thì mỗi lần được trả nợ, "thu nhập" lại
     * phồng lên và con số chênh lệch thu-chi sai theo cả hai hướng.
     */
    const tongThu = Math.max(0, hienTai.income - traLai);
    const tbBaKy = ba.reduce((s, k) => s + k.expense, 0) / 3;
    const byKind = await this.tongTheoKind(userId, range);
    const tyLe = (v: number) => (tongChi > 0 ? Number((v / tongChi).toFixed(4)) : 0);

    return {
      from: range.start,
      to: range.end,
      income: tongThu,
      /** Tổng ngân hàng cộng vào, TRƯỚC khi bỏ phần trả lại — để đối chiếu sao kê */
      incomeGross: hienTai.income,
      /** Phần bạn bè trả lại trong kỳ — tiền của bạn quay về, không phải thu nhập */
      repaidInPeriod: traLai,
      expense: tongChi,
      /** Tổng ngân hàng trừ, TRƯỚC khi bỏ phần cho mượn — để đối chiếu với sao kê */
      expenseGross: hienTai.expense,
      /** Phần đã ứng cho người khác trong kỳ, sẽ được trả lại */
      lentInPeriod: choMuon,
      net: tongThu - tongChi,
      /** Chi tiêu theo need/want/saving — nền cho khung 50/30/20 và gợi ý cắt giảm của AI */
      byKind,
      kindRatio: {
        need: tyLe(byKind.need),
        want: tyLe(byKind.want),
        saving: tyLe(byKind.saving),
      },
      comparison: {
        previousPeriodExpense: kyTruoc.expense,
        changePercent:
          kyTruoc.expense > 0 && !kyTruocThieuDuLieu
            ? Number(((tongChi - kyTruoc.expense) / kyTruoc.expense).toFixed(4))
            : null,
        avg3PeriodsExpense: Math.round(tbBaKy),
        /**
         * `true` = kỳ trước không được dữ liệu phủ hết, nên `changePercent` bị bỏ trống.
         * Trả cờ này ra thay vì im lặng để giao diện nói được LÝ DO không có so sánh —
         * ẩn đi không giải thích thì người dùng tưởng tính năng hỏng.
         */
        previousPeriodPartial: kyTruocThieuDuLieu,
      },
    };
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

    const rows = await this.baseQuery(userId, range, true)
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
  }

  // ————————————————————— Xu hướng —————————————————————

  async getTrend(
    userId: string,
    query: RangeQuery & { groupBy: 'day' | 'week' | 'month' },
  ) {
    const { range } = await this.giaiMaKhoang(userId, query);
    const user = await this.users.findOneByOrFail({ id: userId });

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
  /**
   * `"2026-08-31"` → mốc đầu hoặc cuối ngày đó **theo múi giờ người dùng**.
   *
   * ⚠️ Hai lỗi kinh điển gặp nhau ở đây: quên cuối ngày (`to` loại bỏ chính ngày đó) và
   * quên múi giờ (nửa đêm VN là 17:00 hôm trước theo UTC). Cùng một hàm với
   * `TransactionsService` — hai chỗ tính khác nhau là sớm muộn cũng lệch.
   */
  private bienNgay(ngay: string, phia: 'dau' | 'cuoi'): Date {
    const tz = process.env.TIMEZONE ?? 'Asia/Ho_Chi_Minh';
    const [y, m, d] = ngay.split('-').map(Number);
    return phia === 'dau'
      ? new Date(new TZDate(y, m - 1, d, 0, 0, 0, 0, tz).getTime())
      : new Date(new TZDate(y, m - 1, d, 23, 59, 59, 999, tz).getTime());
  }

  // ————————————————————— Chi tiêu bất thường —————————————————————

  /**
   * Gấp bao nhiêu lần mức chi thường ngày thì đáng báo.
   *
   * Chọn 10 sau khi soi phân bố thật: dữ liệu hiện tại có trung vị 40.500₫, và ngưỡng 10
   * lần lọc ra 2/56 khoản (3,6%). Hạ xuống 8 lần là nhảy lên 7 khoản (12,5%) — cảnh báo
   * nổ 1/8 số giao dịch thì không ai đọc nữa, và một cảnh báo bị phớt lờ còn tệ hơn không
   * có cảnh báo.
   */
  private static readonly NGUONG_GAP_LAN = 10;

  /**
   * Sàn tuyệt đối. Người tiêu lặt vặt có trung vị 5.000₫ thì 10 lần cũng chỉ là 50.000₫ —
   * đúng về mặt thống kê nhưng không đáng làm phiền ai.
   */
  private static readonly SAN_TUYET_DOI = 200_000;

  /** Dưới ngần này giao dịch thì trung vị chưa nói lên điều gì, đừng kết luận bừa */
  private static readonly TOI_THIEU_MAU = 10;

  /**
   * Những khoản chi lớn bất thường so với chính thói quen của người dùng.
   *
   * Dùng TRUNG VỊ làm mốc, không dùng trung bình: trung bình bị chính khoản bất thường kéo
   * lên, nên càng có outlier lớn thì ngưỡng càng cao và outlier càng dễ lọt. Trung vị đứng
   * yên, đó là lý do nó là mốc đúng cho việc này.
   *
   * Mốc tính TRONG KHOẢNG đang xem, không phải toàn bộ lịch sử — để con số cảnh báo khớp
   * với những gì người dùng đang nhìn thấy trên màn hình.
   *
   * ⚠️ CỐ Ý không bỏ "Chưa phân loại": phần lớn giao dịch nằm ở đó, mà một khoản chi lớn
   * chưa gán nhãn thì càng đáng xem. Ngược lại "Trả hộ bạn bè" bị `baseQuery` loại sẵn —
   * tiền cho mượn không phải tiền tiêu, báo động vì nó là báo sai.
   */
  async getAnomalies(userId: string, query: RangeQuery) {
    const { range } = await this.giaiMaKhoang(userId, query);

    /*
     * ⚠️ `percentile_cont` trả về double precision, và raw query thì `transformer: money`
     * KHÔNG chạy — phải Number() thủ công, giống mọi chỗ dùng SUM() trong file này.
     */
    const moc = await this.baseQuery(userId, range)
      .select('percentile_cont(0.5) WITHIN GROUP (ORDER BY t.amount)', 'trungVi')
      .addSelect('COUNT(*)', 'soMau')
      .andWhere('t.type = :type', { type: TxType.EXPENSE })
      .getRawOne<{ trungVi: string | null; soMau: string }>();

    const trungVi = Number(moc?.trungVi ?? 0);
    const soMau = Number(moc?.soMau ?? 0);

    if (soMau < StatsService.TOI_THIEU_MAU || trungVi <= 0) {
      return { items: [], median: trungVi, sampleSize: soMau, threshold: 0 };
    }

    const nguong = Math.max(
      trungVi * StatsService.NGUONG_GAP_LAN,
      StatsService.SAN_TUYET_DOI,
    );

    const rows = await this.baseQuery(userId, range)
      .select(['t.id', 't.amount', 't.date', 't.note'])
      .addSelect(['c.name', 'c.icon', 'c.color'])
      .andWhere('t.type = :type', { type: TxType.EXPENSE })
      .andWhere('t.amount >= :nguong', { nguong })
      .orderBy('t.amount', 'DESC')
      .limit(10)
      .getMany();

    return {
      median: trungVi,
      sampleSize: soMau,
      threshold: nguong,
      items: rows.map((t) => ({
        id: t.id,
        amount: t.amount,
        date: t.date,
        note: t.note,
        category: t.category
          ? { name: t.category.name, icon: t.category.icon, color: t.category.color }
          : null,
        /** Gấp mấy lần mức chi thường ngày — con số để giải thích VÌ SAO bị nêu ra */
        timesMedian: Number((t.amount / trungVi).toFixed(1)),
      })),
    };
  }

  /** Ngày của giao dịch cũ nhất — dùng để biết một kỳ có được dữ liệu phủ hết hay không */
  private async ngayGiaoDichSomNhat(userId: string): Promise<Date | null> {
    const r = await this.txRepo
      .createQueryBuilder('t')
      .select('MIN(t.date)', 'som')
      .where('t.userId = :userId', { userId })
      .getRawOne<{ som: Date | null }>();
    return r?.som ?? null;
  }

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

  /**
   * Chi tiêu gom theo `CategoryKind` (need/want/saving) — đầu vào cho `kindRatio` và
   * cho AI biết vùng nào được phép đề xuất cắt (AI chỉ đụng `want`).
   *
   * Loại "Chưa phân loại" (`boQuaChuaPhanLoai = true`): `kind` của nó không mang ý nghĩa
   * thật (xem `default-categories.ts`), gộp vào sẽ làm lệch tỉ trọng need/want/saving.
   */
  private async tongTheoKind(userId: string, range: DateRange) {
    const rows = await this.baseQuery(userId, range, true)
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
        // Nới thành TRỌN NGÀY theo múi giờ người dùng — xem `bienNgay()`
        range: {
          start: this.bienNgay(query.from, 'dau'),
          end: this.bienNgay(query.to, 'cuoi'),
        },
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
