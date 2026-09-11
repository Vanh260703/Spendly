import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';

const valueVariants = cva('tabular font-bold tracking-tight', {
  variants: {
    tone: {
      neutral: '',
      income: 'text-income',
      expense: 'text-expense',
    },
    size: {
      /** Số dư hero — con số quan trọng nhất màn hình */
      hero: 'text-3xl',
      /** Cặp tiền vào/ra, tổng công nợ… — dùng LẶP LẠI ở nhiều màn hình */
      md: 'text-xl',
      sm: 'text-lg',
    },
  },
  defaultVariants: { tone: 'neutral', size: 'md' },
});

/**
 * Mẫu "nhãn + con số lớn [+ dòng phụ]" xuất hiện ở khắp nơi: số dư hero, cặp tiền vào/ra,
 * tổng công nợ ở danh bạ, tổng theo danh mục — mỗi chỗ trước đây tự viết lại `<p className=
 * "muted text-xs">...</p><p className="tabular text-xl font-bold ...">...</p>`, và mỗi lần
 * viết lại là một cơ hội để cỡ chữ/khoảng cách lệch đi một chút so với chỗ khác.
 *
 * Gộp về một component thì THÊM MỘT MÀN HÌNH THỐNG KÊ MỚI sau này chỉ là gọi `<Stat>` với
 * đúng props, không phải nhớ lại chính xác tổ hợp class đã dùng ở nơi khác.
 */
export function Stat({
  label,
  value,
  tone,
  size,
  icon: Icon,
  className,
  children,
}: VariantProps<typeof valueVariants> & {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="muted flex items-center gap-1.5 text-xs font-medium">
        {Icon && <Icon size={13} />}
        {label}
      </div>
      <p className={cn(valueVariants({ tone, size }), 'mt-0.5')}>{value}</p>
      {children}
    </div>
  );
}
