import { cn } from './utils';

const SIZE = { sm: 'size-7 text-xs', md: 'size-9 text-sm', lg: 'size-12 text-base' };

/**
 * Vòng tròn màu + chữ cái đầu — mẫu nhận diện nhanh một người trong danh sách. Trước đây
 * chỉ có ở trang Danh bạ, viết thẳng tại chỗ; tách ra để chỗ khác cần "ai đó" (VD: người trả
 * hộ trong chi tiết giao dịch, người tham gia chia bill) dùng lại được ngay, cùng một cỡ và
 * quy tắc lấy chữ cái với `CategoryIcon` bên cạnh nó cho nhất quán thị giác.
 */
export function Avatar({
  name,
  color,
  size = 'md',
  className,
}: {
  name: string;
  color?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl font-semibold text-white',
        SIZE[size],
        className,
      )}
      style={{ background: color ?? 'var(--color-neutral-400)' }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
