import { z } from 'zod';
import { Goal, GoalHorizon, GoalStatus } from '../entities/goal.entity';

export const createGoalSchema = z.object({
  name: z.string().trim().min(1, 'Tên mục tiêu không được để trống').max(100),
  description: z.string().trim().max(500).nullable().optional(),
  horizon: z.nativeEnum(GoalHorizon),
  targetAmount: z.number().int().positive('Số tiền mục tiêu phải lớn hơn 0'),
  deadline: z.coerce.date().nullable().optional(),
  monthlyContribution: z.number().int().positive().nullable().optional(),
  icon: z.string().trim().min(1).max(50).default('target'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Màu phải là mã hex').default('#0ea5e9'),
});

export const updateGoalSchema = createGoalSchema
  .extend({ status: z.nativeEnum(GoalStatus) })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Không có gì để cập nhật');

export const contributeSchema = z.object({
  amount: z.number().int().positive('Số tiền nạp phải lớn hơn 0'),
  date: z.coerce.date().default(() => new Date()),
  note: z.string().trim().max(500).optional(),
});

export const listGoalQuerySchema = z.object({
  horizon: z.nativeEnum(GoalHorizon).optional(),
  status: z.nativeEnum(GoalStatus).optional(),
});

export type CreateGoalDto = z.infer<typeof createGoalSchema>;
export type UpdateGoalDto = z.infer<typeof updateGoalSchema>;
export type ContributeDto = z.infer<typeof contributeSchema>;
export type ListGoalQuery = z.infer<typeof listGoalQuerySchema>;

/**
 * Số kỳ đóng góp còn lại tới deadline.
 *
 * Đếm theo **mốc lịch** chứ không chia cho "30 ngày": tháng có 28–31 ngày nên phép chia
 * cứng sẽ lệch dần, và càng gần deadline thì sai số càng ảnh hưởng lớn tới số tiền cần nạp.
 *
 * Dùng `floor` (tối thiểu 1) chứ không `ceil` — đây là lựa chọn **thận trọng có chủ đích**.
 * `ceil` làm số tháng lớn hơn thực tế → số tiền cần mỗi tháng nhỏ đi → user tưởng mình
 * dư dả rồi hụt vào phút chót. Với tiền bạc, sai về phía "cần nhiều hơn" an toàn hơn.
 */
function soKyConLai(deadline: Date, now: Date): number {
  const thang =
    (deadline.getFullYear() - now.getFullYear()) * 12 +
    (deadline.getMonth() - now.getMonth());

  // Chưa qua ngày tương ứng trong tháng thì kỳ đó vẫn còn nạp được
  const buTru = deadline.getDate() >= now.getDate() ? 0 : -1;

  return Math.max(1, thang + buTru + 1);
}

/**
 * `requiredMonthly` và `onTrack` do **BE tính**, không đẩy sang FE.
 *
 * Giá trị thật của tính năng mục tiêu nằm ở câu "bạn đang chậm tiến độ", không phải ở việc
 * lưu một con số đích. Để FE tự tính thì mỗi màn hình lại ra một kết quả khác nhau.
 *
 * Con số này **tự cộng dồn**: tính lại mỗi lần từ (còn thiếu ÷ số kỳ còn lại). Tháng nào
 * không nạp thì "còn thiếu" giữ nguyên nhưng "số kỳ còn lại" giảm đi → số cần nạp đội lên.
 */
export function toGoalDto(
  g: Goal,
  extra: { contributedThisPeriod?: number } = {},
) {
  const conThieu = Math.max(0, g.targetAmount - g.currentAmount);
  const now = new Date();

  const overdue = Boolean(g.deadline && g.deadline < now && conThieu > 0);

  let requiredMonthly: number | null = null;
  if (g.deadline && conThieu > 0) {
    // Quá hạn thì không chia nữa — cần đủ toàn bộ phần còn thiếu, ngay bây giờ
    requiredMonthly = overdue
      ? conThieu
      : Math.ceil(conThieu / soKyConLai(g.deadline, now));
  }

  return {
    id: g.id,
    name: g.name,
    description: g.description ?? null,
    horizon: g.horizon,
    targetAmount: g.targetAmount,
    currentAmount: g.currentAmount,
    remaining: conThieu,
    progress:
      g.targetAmount > 0
        ? Number(Math.min(1, g.currentAmount / g.targetAmount).toFixed(4))
        : 0,
    deadline: g.deadline ?? null,
    monthlyContribution: g.monthlyContribution ?? null,
    requiredMonthly,
    /** Số kỳ còn lại — để FE nói được "còn 4 tháng" thay vì chỉ hiện ngày hạn */
    monthsLeft: g.deadline && !overdue ? soKyConLai(g.deadline, now) : 0,
    /** true = đã qua hạn mà chưa đủ tiền */
    overdue,
    /**
     * Đã nạp bao nhiêu trong kỳ HIỆN TẠI (theo `user.monthStartDay`).
     *
     * `monthlyContribution` chỉ là con số user tự khai sẽ trích — không phản ánh thực tế.
     * Trường này mới trả lời được "tháng này tôi đã để dành chưa?".
     */
    contributedThisPeriod: extra.contributedThisPeriod ?? 0,

    /**
     * KẾ HOẠCH có đủ để kịp hạn không — cố ý tách khỏi `contributedThisPeriod`.
     *
     * Gộp hai thứ vào một cờ sẽ mất thông tin: `onTrack = false` lúc đó không phân biệt
     * được "mục tiêu bất khả thi ngay từ đầu" với "tháng này chưa kịp nạp". Hai vấn đề
     * cần hai cách xử lý khác nhau.
     *
     * null = chưa đặt deadline nên không có gì để so.
     */
    onTrack:
      requiredMonthly === null
        ? null
        : (g.monthlyContribution ?? 0) >= requiredMonthly,
    status: g.status,
    icon: g.icon,
    color: g.color,
  };
}
