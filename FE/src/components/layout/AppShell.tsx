'use client';

import {
  ChartPie, Ellipsis, FileText, LayoutDashboard, LoaderCircle, LogOut, Moon, PiggyBank,
  Receipt, Settings, Sparkles, Sun, Tags, Target, Users, Wallet, X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { useLogout } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Tách 2 nhóm: việc làm HẰNG NGÀY và việc thỉnh thoảng mới đụng.
 *
 * Tab bar mobile chỉ chứa được ~5 mục trước khi chữ bị cắt và vùng bấm quá hẹp,
 * nên nhóm phụ nằm sau nút "Thêm".
 */
const NAV_CHINH = [
  { href: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/transactions', label: 'Giao dịch', icon: Receipt },
  { href: '/budgets', label: 'Ngân sách', icon: ChartPie },
  { href: '/ai', label: 'Trợ lý AI', icon: Sparkles },
] as const;

const NAV_PHU = [
  { href: '/reports', label: 'Báo cáo', icon: FileText },
  { href: '/goals', label: 'Mục tiêu', icon: Target },
  { href: '/debts', label: 'Khoản nợ', icon: PiggyBank },
  { href: '/contacts', label: 'Danh bạ', icon: Users },
  { href: '/categories', label: 'Danh mục', icon: Tags },
  { href: '/settings', label: 'Cài đặt', icon: Settings },
] as const;

const NAV = [...NAV_CHINH, ...NAV_PHU] as const;

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
  const router = useRouter();
  const { accessToken, user, hydrated } = useAuthStore();
  const logout = useLogout();
  const [moThem, setMoThem] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) router.replace('/auth/login');
    else if (!user?.onboardedAt) router.replace('/onboarding');
  }, [hydrated, accessToken, user, router]);

  // Chưa đọc xong localStorage thì chưa biết có phiên hay không — hiện loading
  // thay vì render nội dung rồi giật ra màn hình đăng nhập
  if (!hydrated || !accessToken) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoaderCircle className="animate-spin text-brand" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar — desktop */}
      <aside className="surface sticky top-0 hidden h-dvh w-60 shrink-0 flex-col p-4 md:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand text-white">
            <Wallet size={18} />
          </span>
          <span className="text-lg font-bold">Spendly</span>
        </Link>

        <nav className="flex-1 space-y-1">
          {NAV_CHINH.map(({ href, label, icon: Icon }) => (
            <MucNav key={href} href={href} label={label} Icon={Icon} pathname={pathname} />
          ))}

          <div className="my-2 border-t" />

          {NAV_PHU.map(({ href, label, icon: Icon }) => (
            <MucNav key={href} href={href} label={label} Icon={Icon} pathname={pathname} />
          ))}
        </nav>

        <div className="flex items-center justify-between border-t pt-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="muted truncate text-xs">{user?.email}</p>
          </div>
          <div className="flex shrink-0">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => logout.mutate()} aria-label="Đăng xuất">
              <LogOut size={18} />
            </Button>
          </div>
        </div>
      </aside>

      {/* Header — mobile */}
      <header className="surface sticky top-0 z-30 flex items-center justify-between px-4 py-3 md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-white">
            <Wallet size={16} />
          </span>
          <span className="font-bold">Spendly</span>
        </Link>
        <div className="flex">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={() => logout.mutate()} aria-label="Đăng xuất">
            <LogOut size={18} />
          </Button>
        </div>
      </header>

      {/* pb-24 chừa chỗ cho tab bar cố định dưới đáy trên mobile */}
      <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</main>

      {/* Tab bar — mobile */}
      <nav className="surface fixed inset-x-0 bottom-0 z-30 flex justify-around border-t py-1.5 md:hidden">
        {NAV_CHINH.map(({ href, label, icon: Icon }) => (
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

        <button
          onClick={() => setMoThem(true)}
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] ${
            NAV_PHU.some((n) => pathname.startsWith(n.href)) ? 'text-brand' : 'muted'
          }`}
        >
          <Ellipsis size={20} />
          Thêm
        </button>
      </nav>

      {/* Sheet "Thêm" — mobile */}
      {moThem && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/50 md:hidden"
          onClick={() => setMoThem(false)}
        >
          <div
            className="surface w-full rounded-t-2xl p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Thêm</h2>
              <Button variant="ghost" size="sm" onClick={() => setMoThem(false)} aria-label="Đóng">
                <X size={18} />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {NAV_PHU.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMoThem(false)}
                  className={`flex items-center gap-2.5 rounded-xl p-3 text-sm ${
                    pathname.startsWith(href) ? 'bg-brand text-white' : 'bg-[var(--surface-2)]'
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
