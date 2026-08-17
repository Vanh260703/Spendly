/**
 * Định dạng tiền tệ — **nơi DUY NHẤT trong app được format số tiền**.
 *
 * Toàn hệ thống chỉ dùng VND nên không có tham số `currency`. Rải `toLocaleString`
 * khắp component sẽ dẫn tới mỗi màn hình hiển thị một kiểu.
 */
export function formatMoney(amount: number, opts: { sign?: boolean } = {}): string {
  const s = `${Math.abs(amount).toLocaleString('vi-VN')}₫`;
  if (!opts.sign) return amount < 0 ? `−${s}` : s;
  return amount < 0 ? `−${s}` : `+${s}`;
}

/**
 * Rút gọn cho biểu đồ và ô thống kê: 1.250.000 → "1,25tr".
 * Số đầy đủ quá dài sẽ làm vỡ layout trục biểu đồ trên màn hình hẹp.
 */
export function formatMoneyShort(amount: number): string {
  const abs = Math.abs(amount);
  const dau = amount < 0 ? '−' : '';

  if (abs >= 1_000_000_000) return `${dau}${(abs / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')} tỷ`;
  if (abs >= 1_000_000) return `${dau}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}tr`;
  if (abs >= 1_000) return `${dau}${Math.round(abs / 1_000)}k`;
  return `${dau}${abs}`;
}

export function formatPercent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

const NGAY_TRONG_TUAN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function formatDate(input: string | Date): string {
  const d = new Date(input);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Nhãn ngày cho danh sách giao dịch: "Hôm nay" / "Hôm qua" / "T5, 12/08" */
export function formatDayLabel(input: string | Date): string {
  const d = new Date(input);
  const homNay = new Date();
  const chiNgay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const lech = (chiNgay(homNay) - chiNgay(d)) / 86_400_000;

  if (lech === 0) return 'Hôm nay';
  if (lech === 1) return 'Hôm qua';

  return `${NGAY_TRONG_TUAN[d.getDay()]}, ${d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
  })}`;
}

/** Chuỗi `YYYY-MM-DD` theo giờ ĐỊA PHƯƠNG — `toISOString()` sẽ lệch ngày vì nó quy về UTC */
export function toDateInputValue(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const KIND_LABEL: Record<string, string> = {
  need: 'Cần thiết',
  want: 'Mong muốn',
  saving: 'Tiết kiệm',
};

/**
 * Tên kỳ mà một bản phân tích AI NÓI VỀ: "Tuần 10/08 – 16/08" · "Tháng 8/2026".
 *
 * Đặt ở đây chứ không để mỗi trang tự viết: `/reports` và `/ai` cùng hiển thị các bản ghi
 * `ai_insights`, hai bản sao sẽ trôi khỏi nhau và cùng một tuần hiện ra hai kiểu tên.
 */
export function formatPeriodLabel(kind: string, from?: string, to?: string): string {
  const macDinh: Record<string, string> = {
    weekly: 'Tuần',
    monthly: 'Tháng',
    necessity: 'Phân tích tuần',
    health_score: 'Sức khỏe tài chính',
  };
  if (!from) return macDinh[kind] ?? kind;

  const d = new Date(from);
  if (kind === 'monthly') return `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;

  const den = to ? ` – ${formatDate(to).slice(0, 5)}` : '';
  return `Tuần ${formatDate(from).slice(0, 5)}${den}`;
}
