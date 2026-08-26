import { TZDate } from '@date-fns/tz';
import { TxType } from '../transactions/entities/transaction.entity';
import { SepayApiTransaction } from './sepay-api.client';

/** Múi giờ nghiệp vụ — `transaction_date` của SePay là giờ VN nhưng không ghi rõ */
const MUI_GIO = 'Asia/Ho_Chi_Minh';

/** Một giao dịch đã chuẩn hóa — hình dạng DUY NHẤT mà phần còn lại của app hiểu */
export interface GiaoDichChuanHoa {
  sepayId: number;
  accountNumber: string;
  type: TxType;
  /** Số nguyên đồng, luôn dương */
  amount: number;
  /** Số dư sau giao dịch, do ngân hàng cấp */
  accumulated: number;
  date: Date;
  content: string | null;
  referenceCode: string | null;
}

/**
 * Đổi một dòng từ SePay API sang hình dạng nội bộ.
 *
 * ⚠️ **Mọi số SePay trả về đều là CHUỖI** (`"50000.00"`). Cộng thẳng là ra nối chuỗi — đúng
 * loại lỗi dự án này đã dính một lần với `SUM()` của Postgres. Phải `Number()` rồi làm tròn.
 *
 * ⚠️ **Chiều tiền suy từ hai cột riêng**, không có cờ `in`/`out` như webhook: `amount_in`
 * có giá trị thì là tiền vào, `amount_out` thì là tiền ra. Cột còn lại mang `"0.00"`.
 */
export function chuanHoa(t: SepayApiTransaction): GiaoDichChuanHoa {
  const vao = Math.round(Number(t.amount_in ?? 0));
  const ra = Math.round(Number(t.amount_out ?? 0));

  return {
    sepayId: Number(t.id),
    accountNumber: t.account_number,
    type: vao > 0 ? TxType.INCOME : TxType.EXPENSE,
    amount: vao > 0 ? vao : ra,
    accumulated: Math.round(Number(t.accumulated ?? 0)),
    date: doiSangUtc(t.transaction_date),
    content: t.transaction_content?.trim() || null,
    referenceCode: t.reference_number ?? null,
  };
}

/**
 * `"2026-08-26 21:15:00"` → `Date` đúng thời điểm.
 *
 * ⚠️ Chuỗi này KHÔNG có múi giờ. `new Date(chuỗi)` sẽ hiểu theo giờ MÁY CHỦ — container
 * chạy UTC nên giao dịch lúc 7h sáng VN bị đẩy sang **ngày hôm trước**, và mọi thống kê
 * theo ngày/tuần/tháng lệch theo. Phải nói rõ đây là giờ VN.
 */
export function doiSangUtc(chuoi: string): Date {
  const [ngay, gio = '00:00:00'] = chuoi.trim().split(' ');
  const [y, m, d] = ngay.split('-').map(Number);
  const [hh, mm, ss] = gio.split(':').map(Number);
  return new Date(
    new TZDate(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, ss ?? 0, MUI_GIO).getTime(),
  );
}
