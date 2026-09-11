'use client';

import { cn } from './utils';

/**
 * Chuyển vùng nội dung bằng tab thay vì bắt cuộn qua tất cả — khác hẳn mô hình "xếp chồng
 * card rồi cuộn" trước đây. Đặt tên file riêng (không gộp vào button.tsx) vì đây là một khái
 * niệm khác: Button là một hành động, Segmented là một BỘ lựa chọn loại trừ lẫn nhau, ngữ
 * nghĩa gần với radio group hơn là nút bấm.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex rounded-[var(--radius-control)] bg-[var(--surface-2)] p-1',
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[calc(var(--radius-control)-4px)] px-4 py-1.5 text-sm font-medium transition-all',
            value === o.value ? 'surface elevation-sm' : 'muted hover:text-[var(--text)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
