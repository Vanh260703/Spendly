'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from './utils';

/**
 * `cva` khai variant dạng BẢNG có kiểu, thay cho object `{ primary: '...', secondary: '...' }`
 * tự viết tay trước đây. Lợi ích không phải ở cách viết — mà ở chỗ TypeScript giờ tự chặn
 * được `variant="danget"` (gõ nhầm) ngay lúc biên dịch, và thêm một variant mới chỉ là thêm
 * một dòng trong `variants`, không phải sửa type riêng ở đâu đó.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium',
    'transition-all active:scale-[0.98]',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
  ],
  {
    variants: {
      variant: {
        /*
         * Nút hành động chính mang bóng TÔ MÀU brand (`elevation-brand`), không phải bóng
         * xám trung tính — nó phải là điểm nổi bật nhất màn hình nhờ cả màu LẪN độ sâu.
         */
        primary: 'bg-brand text-white hover:bg-brand-600 elevation-brand disabled:shadow-none',
        secondary: 'surface hover:bg-[var(--surface-hover)] hover:elevation-sm',
        ghost: 'hover:bg-[var(--surface-hover)]',
        danger: 'bg-expense text-white hover:opacity-90',
        /** Viền brand, nền trong suốt — dùng khi cần rõ ràng là hành động chính nhưng ngữ
         *  cảnh không cho phép một khối màu đặc (VD: nằm trên nền đã có màu riêng) */
        outline: 'border border-brand text-brand hover:bg-brand/10',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-lg',
        /** Nút chỉ-icon — vuông đều, không có padding ngang thừa */
        icon: 'size-10 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // Khóa nút khi đang gửi để không tạo hai giao dịch vì lỡ bấm hai lần
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), className)}
      {...rest}
    >
      {loading && <LoaderCircle size={16} className="animate-spin" />}
      {children}
    </button>
  );
});
