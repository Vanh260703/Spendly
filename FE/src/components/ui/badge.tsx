import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';

/**
 * Chip/pill nhỏ cho trạng thái, số đếm, nhãn — trước đây MỖI CHỖ cần một cái pill lại tự
 * viết tay `rounded-full px-1.5 py-0.5 bg-brand text-white text-xs` (badge "chưa xét" trong
 * `TransactionFilters`, badge trong `TransactionList`, badge % trong `CategoryBreakdown`…),
 * mỗi nơi một chút khác biệt về padding/cỡ chữ. Gộp về một component thì:
 *   - đổi bo góc/padding chuẩn của app chỉ sửa MỘT chỗ, không phải lùng sục cả codebase
 *   - `tone` đặt tên theo Ý NGHĨA (thành công/cảnh báo/trung tính) chứ không phải màu thô,
 *     nên chỗ gọi không phải tự nhớ "chưa xét thì màu gì" — cứ chọn đúng ý nghĩa là ra đúng màu
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        brand: 'bg-brand text-white',
        neutral: 'bg-[var(--surface-2)] text-[var(--text-muted)]',
        income: 'bg-income-soft text-income',
        expense: 'bg-expense-soft text-expense',
        warning: 'bg-warning-soft text-warning',
        /** Nền trong suốt trên nền TỐI MÀU sẵn (VD: đặt trên thẻ hero đã có nền gradient) */
        'on-color': 'bg-white/20 text-white',
      },
      size: {
        sm: 'px-1.5 py-0.5 text-[11px]',
        md: 'px-2 py-0.5 text-xs',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

export function Badge({
  tone,
  size,
  className,
  children,
}: VariantProps<typeof badgeVariants> & {
  className?: string;
  children: React.ReactNode;
}) {
  return <span className={cn(badgeVariants({ tone, size }), className)}>{children}</span>;
}
