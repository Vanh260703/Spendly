'use client';

import { RotateCw, TriangleAlert } from 'lucide-react';
import { Button } from './button';
import { cn } from './utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      {Icon && (
        <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-[var(--surface-2)]">
          <Icon size={22} className="muted" />
        </span>
      )}
      <p className="font-medium">{title}</p>
      {description && <p className="muted max-w-sm text-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * Trạng thái LỖI — phải phân biệt rõ với trạng thái RỖNG.
 *
 * Dùng `EmptyState` cho cả hai là bug: request hỏng sẽ hiển thị "chưa có dữ liệu",
 * người dùng tưởng mất sạch số liệu trong khi thật ra chỉ là API không gọi được.
 */
export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <span className="bg-warning-soft mb-1 flex size-12 items-center justify-center rounded-full">
        <TriangleAlert size={22} className="text-warning" />
      </span>
      <p className="font-medium">Không tải được dữ liệu</p>
      <p className="muted max-w-sm text-sm">
        {message ?? 'Vui lòng kiểm tra kết nối và thử lại'}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-1" onClick={onRetry}>
          <RotateCw size={14} /> Thử lại
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-[var(--surface-2)]', className)} />;
}
