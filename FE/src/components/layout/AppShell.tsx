'use client';

import { Moon, Receipt, Sun, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { useProfile } from '@/hooks/useSettings';

/**
 * Tách 2 nhóm: việc làm HẰNG NGÀY và việc thỉnh thoảng mới đụng.
 *
 * Tab bar mobile chỉ chứa được ~5 mục trước khi chữ bị cắt và vùng bấm quá hẹp,
 * nên nhóm phụ nằm sau nút "Thêm".
 */
/**
 * Ba mục, hết.
 *
 * App làm hai việc — dòng tiền và công nợ — nên có đúng hai màn hình chính. `Danh mục` là
 * hạ tầng cho việc gán nhãn giao dịch, không phải một tính năng thứ ba.
 *
 * gộp lại thì bớt được một lớp menu người dùng phải mở ra mới thấy.
 */
const NAV = [
  { href: '/transactions', label: 'Dòng tiền', icon: Receipt },
  { href: '/contacts', label: 'Công nợ', icon: Users },
] as const;

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);

  const doi = () => {
    const moi = !dark;
    setDark(moi);
    document.documentElement.classList.toggle('dark', moi);
    localStorage.setItem('spendly-theme', moi ? 'dark' : 'light');
  };

  return (
    <Button variant="ghost" size="sm" onClick={doi} aria-label="Đổi giao diện sáng/tối">
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </Button>
  );
}

function MucNav({
  href,
  label,
  Icon,
  pathname,
}: {
  href: (typeof NAV)[number]['href'];
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
  pathname: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
        pathname.startsWith(href) ? 'bg-brand text-white' : 'hover:bg-[var(--surface-2)]'
      }`}
    >
      <Icon size={18} />
      {label}
    </Link>
  );
}

/**
 * Khung chung cho khu vực đã đăng nhập: chặn truy cập khi chưa có phiên,
 * hiện sidebar trên desktop và tab bar dưới đáy trên mobile.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: profile } = useProfile();

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar — desktop */}
      <aside className="surface sticky top-0 hidden h-dvh w-60 shrink-0 flex-col p-4 md:flex">
        <Link href="/transactions" className="mb-6 flex items-center gap-2 px-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand text-white">
            <Wallet size={18} />
          </span>
          <span className="text-lg font-bold">Spendly</span>
        </Link>

        <nav className="flex-1 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <MucNav key={href} href={href} label={label} Icon={Icon} pathname={pathname} />
          ))}

          <div className="my-2 border-t" />
        </nav>

        <div className="flex items-center justify-between border-t pt-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{profile?.name ?? 'Tôi'}</p>
            <p className="muted truncate text-xs">
              {profile?.bankAccount?.bankName ?? 'Chưa liên kết ngân hàng'}
            </p>
          </div>
          <div className="flex shrink-0">
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Header — mobile */}
      <header className="surface sticky top-0 z-30 flex items-center justify-between px-4 py-3 md:hidden">
        <Link href="/transactions" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-white">
            <Wallet size={16} />
          </span>
          <span className="font-bold">Spendly</span>
        </Link>
        <ThemeToggle />
      </header>

      {/* pb-24 chừa chỗ cho tab bar cố định dưới đáy trên mobile */}
      <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</main>

      {/* Tab bar — mobile */}
      <nav className="surface fixed inset-x-0 bottom-0 z-30 flex justify-around border-t py-1.5 md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] ${
              pathname.startsWith(href) ? 'text-brand' : 'muted'
            }`}
          >
            <Icon size={20} />
            {label}
          </Link>
        ))}

      </nav>
    </div>
  );
}
