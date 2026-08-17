'use client';

import { LoaderCircle, RotateCw, TriangleAlert } from 'lucide-react';
import { forwardRef } from 'react';

export const cn = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ');

// ————————————————————————— Button —————————————————————————

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
};

const BUTTON_VARIANT = {
  primary: 'bg-brand text-white hover:bg-brand-600 disabled:bg-brand/50',
  secondary: 'surface hover:bg-[var(--surface-2)]',
  ghost: 'hover:bg-[var(--surface-2)]',
  danger: 'bg-expense text-white hover:opacity-90',
};

const BUTTON_SIZE = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4', lg: 'h-12 px-6 text-lg' };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // Khóa nút khi đang gửi để không tạo hai giao dịch vì lỡ bấm hai lần
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-60',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading && <LoaderCircle size={16} className="animate-spin" />}
      {children}
    </button>
  );
});

// ————————————————————————— Input —————————————————————————

type FieldProps = { label?: string; error?: string; hint?: string };

export function Field({
  label,
  error,
  hint,
  children,
}: FieldProps & { children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-medium">{label}</span>}
      {children}
      {error ? (
        <span className="block text-sm text-expense">{error}</span>
      ) : hint ? (
        <span className="muted block text-xs">{hint}</span>
      ) : null}
    </label>
  );
}

const CONTROL =
  'w-full rounded-xl surface px-3.5 h-11 outline-none transition focus:ring-2 focus:ring-brand/40';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(CONTROL, className)} {...rest} />;
  },
);

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(CONTROL, 'cursor-pointer', className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea ref={ref} className={cn(CONTROL, 'h-auto py-2.5', className)} {...rest} />
  );
});

// ————————————————————————— Card —————————————————————————

export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('surface rounded-2xl p-4', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="font-semibold">{children}</h2>
      {action}
    </div>
  );
}

// ————————————————————————— Trạng thái rỗng / loading —————————————————————————

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
      {Icon && <Icon size={32} className="muted" />}
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
      <TriangleAlert size={28} className="text-warning" />
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
  return (
    <div
      className={cn('animate-pulse rounded-xl bg-[var(--surface-2)]', className)}
    />
  );
}

// ————————————————————————— Progress —————————————————————————

/** Thanh tiến độ. `tone` để gọi đúng ngữ nghĩa thay vì truyền màu thô từ chỗ gọi. */
export function Progress({
  value,
  tone = 'brand',
}: {
  value: number;
  tone?: 'brand' | 'ok' | 'warning' | 'exceeded';
}) {
  const mau = {
    brand: 'bg-brand',
    ok: 'bg-ok',
    warning: 'bg-warning',
    exceeded: 'bg-exceeded',
  }[tone];

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
      <div
        className={cn('h-full rounded-full transition-all', mau)}
        // Chặn ở 100% để thanh không tràn khỏi khung khi vượt ngân sách
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}

// ————————————————————————— Modal —————————————————————————

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="surface max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export { MoneyInput } from './MoneyInput';
export { CategoryIcon, CATEGORY_ICONS, type CategoryIconName } from './CategoryIcon';
