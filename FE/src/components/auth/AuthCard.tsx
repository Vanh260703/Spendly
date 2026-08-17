import { Wallet } from 'lucide-react';
import Link from 'next/link';

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-white">
            <Wallet size={20} />
          </span>
          <span className="text-xl font-bold">Spendly</span>
        </Link>

        <div className="surface rounded-2xl p-6">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="muted mt-1 mb-5 text-sm">{subtitle}</p>
          {children}
        </div>

        <p className="muted mt-4 text-center text-sm">{footer}</p>
      </div>
    </div>
  );
}
