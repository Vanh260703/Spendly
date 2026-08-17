import { z } from 'zod';

/**
 * Schema validate cho auth.
 *
 * TODO: khi làm FE, chuyển các schema này ra thư mục `shared/` ở gốc repo để FE dùng
 * chung qua `zodResolver` (xem `SPEC.md` §5) — định nghĩa quy tắc hai lần chắc chắn
 * có ngày lệch nhau.
 */

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
  password: z
    .string()
    .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
    .max(72, 'Mật khẩu quá dài'),
  name: z.string().trim().min(1, 'Vui lòng nhập tên').max(100),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
