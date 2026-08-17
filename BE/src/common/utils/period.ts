import { TZDate } from '@date-fns/tz';
import {
  addDays,
  addMonths,
  endOfDay,
  startOfDay,
  startOfWeek,
  subMilliseconds,
} from 'date-fns';

export type PeriodKind = 'today' | 'week' | 'month';

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Tính khoảng thời gian của một kỳ — **nơi DUY NHẤT trong dự án được phép làm việc này**.
 *
 * `user.monthStartDay` áp dụng cho ngân sách, thống kê VÀ báo cáo AI. Chỉ cần một chỗ
 * quên tính theo nó là số liệu giữa dashboard và ngân sách lệch nhau — mà loại lệch này
 * rất khó phát hiện vì cả hai con số đều "trông hợp lý".
 *
 * Mọi phép tính đều làm trong **múi giờ của user**: "hôm nay" của người ở Việt Nam bắt đầu
 * lúc 00:00 giờ Việt Nam, không phải 00:00 UTC. Tính theo UTC sẽ khiến giao dịch lúc 7 giờ
 * sáng bị đẩy sang ngày hôm trước.
 */
export function resolvePeriod(
  kind: PeriodKind,
  opts: { timezone: string; monthStartDay: number; now?: Date },
): DateRange {
  const { timezone, monthStartDay, now = new Date() } = opts;
  const tzNow = new TZDate(now, timezone);

  switch (kind) {
    case 'today':
      return { start: startOfDay(tzNow), end: endOfDay(tzNow) };

    case 'week':
      // Tuần bắt đầu từ THỨ HAI (weekStartsOn: 1) — chuẩn Việt Nam, khác mặc định Chủ nhật
      return {
        start: startOfDay(startOfWeek(tzNow, { weekStartsOn: 1 })),
        end: endOfDay(addDays(startOfWeek(tzNow, { weekStartsOn: 1 }), 6)),
      };

    case 'month':
      return monthPeriod(tzNow, monthStartDay, timezone);
  }
}

/**
 * Kỳ "tháng" theo `monthStartDay`.
 *
 * `monthStartDay = 1`  → 01/08 – 31/08 (tháng dương lịch)
 * `monthStartDay = 25` → 25/07 – 24/08 (chu kỳ theo ngày nhận lương)
 *
 * Mốc bắt đầu là ngày `monthStartDay` GẦN NHẤT ĐÃ QUA: hôm nay 13/08 với mốc 25 thì kỳ
 * hiện tại đã bắt đầu từ 25/07, chưa phải 25/08.
 */
function monthPeriod(tzNow: TZDate, monthStartDay: number, timezone: string): DateRange {
  const namThangNgay = (d: TZDate) =>
    new TZDate(d.getFullYear(), d.getMonth(), monthStartDay, 0, 0, 0, 0, timezone);

  let start = namThangNgay(tzNow);
  if (tzNow.getDate() < monthStartDay) {
    start = new TZDate(addMonths(start, -1), timezone);
  }

  // Kết thúc ngay TRƯỚC mốc bắt đầu của kỳ sau — không tự cộng "30 ngày" vì độ dài
  // tháng khác nhau, và cũng tránh hở/chồng lấn 1 mili giây giữa hai kỳ
  const end = subMilliseconds(addMonths(start, 1), 1);
  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

/**
 * Dịch một khoảng lùi về quá khứ `n` lần độ dài của chính nó — dùng để so sánh
 * "kỳ này với kỳ trước" và "trung bình 3 kỳ gần nhất".
 *
 * Với kỳ tháng thì dịch theo THÁNG chứ không theo số mili giây, để tháng 2 (28 ngày)
 * không bị lệch so với tháng 1 (31 ngày).
 */
export function shiftRange(range: DateRange, n: number, kind: PeriodKind): DateRange {
  if (kind === 'month') {
    return {
      start: addMonths(range.start, -n),
      end: subMilliseconds(addMonths(range.start, -n + 1), 1),
    };
  }

  const doDai = range.end.getTime() - range.start.getTime() + 1;
  return {
    start: new Date(range.start.getTime() - doDai * n),
    end: new Date(range.end.getTime() - doDai * n),
  };
}

/** Khóa cache ổn định cho một khoảng — cùng khoảng phải ra cùng chuỗi */
export function rangeKey(range: DateRange): string {
  return `${range.start.toISOString()}_${range.end.toISOString()}`;
}
