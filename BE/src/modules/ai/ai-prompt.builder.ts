import { createHash } from 'node:crypto';

export interface CategoryStat {
  category: { id: string; name: string; kind: string };
  total: number;
  count: number;
  average: number;
  percentOfExpense: number;
  percentOfIncome: number;
  vsPrevious3Avg: number | null;
}

export interface NecessityInput {
  periodLabel: string;
  income: number;
  expense: number;
  monthlyIncome: number | null;
  byKind: { need: number; want: number; saving: number };
  categories: CategoryStat[];
  goals: { name: string; monthlyTarget: number }[];
  /** Số ngày có dữ liệu — dưới 14 thì AI phải nói "chưa đủ dữ liệu" thay vì suy diễn */
  daysOfData: number;
}

const dinhDang = (n: number) => `${n.toLocaleString('vi-VN')}₫`;
const phanTram = (n: number | null) =>
  n === null ? 'chưa đủ dữ liệu' : `${n > 0 ? '+' : ''}${(n * 100).toFixed(0)}%`;

/**
 * Luật bất di bất dịch cho MỌI prompt gửi AI (SPEC §4.7).
 *
 * Không có những ràng buộc này thì AI sẽ bịa số, khuyên cắt tiền nhà, hoặc lên lớp
 * người dùng — cả ba đều làm hỏng sản phẩm nhanh hơn là không có AI.
 */
export const SYSTEM_PROMPT = `Bạn là trợ lý tài chính cá nhân cho người dùng Việt Nam. Trả lời bằng tiếng Việt.

QUY TẮC BẮT BUỘC:
1. KHÔNG BỊA SỐ. Mọi con số trong câu trả lời phải lấy từ dữ liệu được cung cấp. Không suy đoán số liệu không có.
2. CHỈ đề xuất cắt giảm ở danh mục có kind="want". TUYỆT ĐỐI KHÔNG đề xuất cắt kind="need" (tiền nhà, điện nước, ăn cơ bản, thuốc men) hay kind="saving".
3. Mỗi gợi ý phải kèm SỐ TIỀN TIẾT KIỆM ĐƯỢC mỗi tháng. Nếu người dùng có mục tiêu đang chạy, quy đổi ra % tiến độ mục tiêu đó.
4. GIỌNG TRUNG LẬP, không phán xét. Đưa lựa chọn chứ không ra lệnh. Cấm dùng từ mang tính đạo đức như "lãng phí", "hoang phí", "vung tay".
5. Nếu daysOfData < 14, nói rõ "chưa đủ dữ liệu để so sánh" thay vì suy diễn xu hướng.
6. Phân biệt VẤN ĐỀ TẦN SUẤT với VẤN ĐỀ MỨC CHI: nhiều lần số tiền nhỏ thì khuyên giảm số lần; ít lần số tiền lớn thì khuyên giảm mức chi mỗi lần.`;

/**
 * Chỉ phần DỮ LIỆU, không kèm chỉ thị định dạng đầu ra.
 *
 * Tách riêng vì `chat()` cũng cần bối cảnh tài chính này, nhưng phải trả lời bằng câu
 * hội thoại. Trước đây chat dùng chung `buildNecessityPrompt()` nên thừa hưởng luôn câu
 * "trả về JSON" ở cuối — kết quả là user hỏi một câu bình thường mà nhận về khối JSON thô.
 */
export function buildFinancialContext(input: NecessityInput): string {
  const dong = input.categories
    .map(
      (c) =>
        `- ${c.category.name} [${c.category.kind}]: ${dinhDang(c.total)} · ${c.count} lần · TB ${dinhDang(c.average)}/lần · ${(c.percentOfExpense * 100).toFixed(1)}% tổng chi · ${(c.percentOfIncome * 100).toFixed(1)}% thu nhập · so với TB 3 kỳ trước: ${phanTram(c.vsPrevious3Avg)}`,
    )
    .join('\n');

  const mucTieu = input.goals.length
    ? input.goals
        .map((g) => `- ${g.name}: cần ${dinhDang(g.monthlyTarget)}/tháng`)
        .join('\n')
    : '(chưa đặt mục tiêu nào)';

  return `Kỳ phân tích: ${input.periodLabel}
Số ngày có dữ liệu: ${input.daysOfData}

TỔNG QUAN
- Thu: ${dinhDang(input.income)}
- Chi: ${dinhDang(input.expense)}
- Thu nhập hàng tháng (user khai): ${input.monthlyIncome ? dinhDang(input.monthlyIncome) : 'chưa khai'}
- Cần thiết (need): ${dinhDang(input.byKind.need)} · Mong muốn (want): ${dinhDang(input.byKind.want)} · Tiết kiệm (saving): ${dinhDang(input.byKind.saving)}

CHI TIÊU THEO DANH MỤC
${dong || '(không có giao dịch nào trong kỳ)'}

MỤC TIÊU ĐANG CHẠY
${mucTieu}`;
}

/** Bối cảnh + yêu cầu trả JSON — dùng cho `necessity-review`, KHÔNG dùng cho chat */
export function buildNecessityPrompt(input: NecessityInput): string {
  return `${buildFinancialContext(input)}

YÊU CẦU
Đánh giá từng danh mục kind="want": nên giữ nguyên (keep), nên giảm (reduce), hay nên cắt (cut).
Trả về JSON đúng cấu trúc sau, không thêm chữ nào ngoài JSON:
{
  "summary": "1-2 câu tóm tắt tình hình kỳ này, có số cụ thể",
  "suggestions": [
    {
      "categoryName": "tên danh mục",
      "verdict": "keep" | "reduce" | "cut",
      "reason": "lý do dựa trên số tiền + tần suất + xu hướng",
      "action": "hành động cụ thể nên làm",
      "monthlySaving": số tiền tiết kiệm được mỗi tháng (số nguyên, 0 nếu verdict=keep)
    }
  ]
}`;
}

export interface PeriodReportInput extends NecessityInput {
  /** So với kỳ trước — để báo cáo nói được "tăng/giảm bao nhiêu" */
  previousExpense: number;
  changePercent: number | null;
  /** Ngân sách: đã tiêu / hạn mức thực tế của kỳ */
  budgets: { name: string; spent: number; limit: number; status: string }[];
  goals: { name: string; monthlyTarget: number; progress: number; contributedThisPeriod: number }[];
  debts: { name: string; remaining: number; interestRate: number }[];
}

/**
 * Báo cáo tổng kết kỳ — khác `necessity-review` ở chỗ nhìn TOÀN CẢNH thay vì chỉ soi
 * từng danh mục: có so sánh kỳ trước, tình hình ngân sách, tiến độ mục tiêu, khoản nợ.
 *
 * Đầu ra chia 4 phần vì đó là thứ tự người ta muốn đọc: chuyện gì đã xảy ra → điểm đáng
 * chú ý → điều cần dè chừng → làm gì tiếp theo.
 */
export function buildPeriodReportPrompt(input: PeriodReportInput): string {
  const nganSach = input.budgets.length
    ? input.budgets
        .map(
          (b) =>
            `- ${b.name}: đã tiêu ${dinhDang(b.spent)} / hạn mức ${dinhDang(b.limit)} (${b.status})`,
        )
        .join('\n')
    : '(chưa đặt ngân sách nào)';

  const mucTieu = input.goals.length
    ? input.goals
        .map(
          (g) =>
            `- ${g.name}: tiến độ ${(g.progress * 100).toFixed(0)}%, kỳ này đã nạp ${dinhDang(g.contributedThisPeriod)} (cần ${dinhDang(g.monthlyTarget)}/kỳ)`,
        )
        .join('\n')
    : '(chưa đặt mục tiêu nào)';

  const no = input.debts.length
    ? input.debts
        .map((d) => `- ${d.name}: còn ${dinhDang(d.remaining)}, lãi ${d.interestRate}%/năm`)
        .join('\n')
    : '(không có khoản nợ nào)';

  return `${buildFinancialContext(input)}

SO VỚI KỲ TRƯỚC
- Chi kỳ trước: ${dinhDang(input.previousExpense)}
- Thay đổi: ${input.changePercent === null ? 'chưa đủ dữ liệu để so sánh' : phanTram(input.changePercent)}

NGÂN SÁCH
${nganSach}

MỤC TIÊU
${mucTieu}

KHOẢN NỢ
${no}

YÊU CẦU
Viết báo cáo tổng kết kỳ. Trả JSON đúng cấu trúc sau, không thêm chữ nào ngoài JSON:
{
  "summary": "2-3 câu tóm tắt tình hình kỳ này, có số cụ thể",
  "highlights": [
    { "label": "tên chỉ số", "value": "giá trị dạng chữ", "note": "1 câu diễn giải" }
  ],
  "warnings": ["điều cần dè chừng, mỗi câu một mục. Mảng rỗng nếu không có gì đáng lo"],
  "actions": [
    { "title": "việc nên làm", "detail": "làm cụ thể thế nào", "impact": "tác động bằng số tiền" }
  ]
}
Tối đa 4 highlights, tối đa 3 warnings, ĐÚNG 3 actions xếp theo mức quan trọng giảm dần.`;
}

export interface HealthScoreInput {
  savingRate: number;
  budgetAdherence: number | null;
  emergencyMonths: number | null;
  debtToIncome: number | null;
  monthlyIncome: number | null;
}

export function buildHealthScorePrompt(input: HealthScoreInput): string {
  return `Chấm điểm sức khỏe tài chính (0-100) dựa trên các chỉ số sau:

- Tỷ lệ tiết kiệm (thu trừ chi, chia thu): ${(input.savingRate * 100).toFixed(1)}%
- Mức tuân thủ ngân sách: ${input.budgetAdherence === null ? 'chưa đặt ngân sách' : `${(input.budgetAdherence * 100).toFixed(0)}% số kỳ nằm trong hạn mức`}
- Quỹ dự phòng: ${input.emergencyMonths === null ? 'chưa xác định' : `${input.emergencyMonths.toFixed(1)} tháng chi tiêu`}
- Tỷ lệ nợ trên thu nhập: ${input.debtToIncome === null ? 'không có nợ' : `${(input.debtToIncome * 100).toFixed(0)}%`}

Thang điểm: tiết kiệm tối đa 30, tuân thủ ngân sách tối đa 25, quỹ dự phòng tối đa 25, tỷ lệ nợ tối đa 20.

Trả JSON, không thêm chữ nào ngoài JSON:
{
  "score": tổng điểm 0-100,
  "breakdown": { "savingRate": số, "budgetAdherence": số, "emergencyFund": số, "debtRatio": số },
  "explanation": "2-3 câu giải thích, chỉ ra điểm trừ lớn nhất và cách cải thiện"
}`;
}

/**
 * Dấu vân tay của dữ liệu đầu vào — **cơ chế chính giúp không đụng trần quota**.
 *
 * Trước khi gọi API: băm dữ liệu hiện tại, trùng hash đã có thì trả bản cũ luôn.
 * Băm chuỗi đã chuẩn hóa (không phải object) để thứ tự key không làm đổi hash.
 */
export function hashInput(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 32);
}
