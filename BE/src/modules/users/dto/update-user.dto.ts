import { z } from 'zod';

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1, 'Tên không được để trống').max(100),
    avatarUrl: z.string().url('Link ảnh không hợp lệ').nullable(),
    timezone: z.string().min(1),
    // Giới hạn 28 vì tháng 2 chỉ có 28 ngày — cho phép 29–31 sẽ tạo ra những tháng
    // không có ngày bắt đầu, và ranh giới kỳ ngân sách sẽ nhảy lung tung.
    monthStartDay: z.number().int().min(1).max(28),
    monthlyIncome: z.number().int().nonnegative().nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Không có gì để cập nhật');

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại'),
  newPassword: z
    .string()
    .min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự')
    .max(72, 'Mật khẩu quá dài'),
});

export const onboardingSchema = z.object({
  /** "Hiện tại bạn có tổng cộng bao nhiêu tiền?" → ghi vào ví */
  initialBalance: z.number().int().nonnegative('Số tiền không được âm'),
  /** "Thu nhập hàng tháng khoảng bao nhiêu?" → để gợi ý ngân sách 50/30/20 */
  monthlyIncome: z.number().int().nonnegative().optional(),
});

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
export type OnboardingDto = z.infer<typeof onboardingSchema>;
