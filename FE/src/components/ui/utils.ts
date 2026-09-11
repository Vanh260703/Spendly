import { twMerge } from 'tailwind-merge';

/**
 * Gộp class Tailwind, **lớp truyền vào sau THẮNG**.
 *
 * ⚠️ Nếu chỉ `join(' ')`, đó là một cái bẫy nằm ở mọi component có override class: `Input`
 * mang sẵn `w-full`, truyền thêm `w-36` vào thì ra `class="w-full ... w-36"` — hai lớp cùng
 * tồn tại, `w-full` thắng vì đứng sau trong CSS gốc, và ô input giãn hết cỡ dù mã nguồn nói
 * rõ là muốn 36. Không có lỗi nào được báo; chỉ có giao diện sai.
 *
 * `twMerge` biết `w-full` và `w-36` là cùng một nhóm nên bỏ cái trước, giữ cái sau.
 */
export const cn = (...parts: (string | false | null | undefined)[]) =>
  twMerge(parts.filter(Boolean).join(' '));
