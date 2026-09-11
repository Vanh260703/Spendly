'use client';

import { forwardRef } from 'react';
import { cn } from './utils';

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
  'w-full rounded-[var(--radius-control)] surface px-3.5 h-11 outline-none transition ' +
  'focus:ring-2 focus:ring-brand/40 focus:border-brand/40';

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
  return <textarea ref={ref} className={cn(CONTROL, 'h-auto py-2.5', className)} {...rest} />;
});
