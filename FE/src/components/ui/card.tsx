import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';

/**
 * `padding` tách riêng khỏi `className` vì nó là quyết định LAYOUT (bảng bên trong card cần
 * `none` để tự lo padding từng ô), còn `tone` là quyết định VAI TRÒ của card trên màn hình —
 * hai trục biến thiên độc lập, gộp chung vào một `className` tùy ý thì mỗi chỗ gọi lại phải
 * tự nhớ đúng tổ hợp class, dễ lệch dần qua thời gian.
 */
const cardVariants = cva('rounded-[var(--radius-surface)]', {
  variants: {
    tone: {
      /** Mặc định — mọi card thống kê, danh sách, form */
      surface: 'surface elevation-sm',
      /** Card nổi bật hơn khi tương tác (hover) — dùng cho hàng bấm được, không phải card tĩnh */
      interactive: 'surface elevation-sm transition-shadow hover:elevation-md',
      /** Không viền/bóng — khi Card lồng bên trong Card khác, hai lớp bóng chồng nhau trông rối */
      flat: 'bg-[var(--surface-2)]',
    },
    padding: {
      md: 'p-4',
      sm: 'p-3',
      none: 'p-0',
    },
  },
  defaultVariants: { tone: 'surface', padding: 'md' },
});

export function Card({
  tone,
  padding,
  className,
  children,
  ...rest
}: VariantProps<typeof cardVariants> &
  React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(cardVariants({ tone, padding }), className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-[15px] font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}
