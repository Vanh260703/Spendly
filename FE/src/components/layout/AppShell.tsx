'use client';

import {
  Bot, ChartPie, LayoutDashboard, LayoutGrid, ListTree, Moon, PiggyBank, Receipt, Sun, Target,
  Users, Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { useProfile } from '@/hooks/useSettings';

/**
 * Hai nhóm: việc làm HẰNG NGÀY (tổng quan, dòng tiền, công nợ, trợ lý AI) và việc thỉnh
 * thoảng mới đụng (ngân sách, mục tiêu, nợ, báo cáo, danh mục).
 *
 * Tab bar mobile chỉ chứa được ~5 mục trước khi chữ bị cắt và vùng bấm quá hẹp, nên nhóm
 * phụ nằm sau nút "Thêm". Desktop rộng hơn thì sidebar hiện cả hai nhóm luôn, không cần ẩn.
 */
const NAV_CHINH = [
  { href: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/transactions', label: 'Giao dịch', icon: Receipt },
  { href: '/contacts', label: 'Công nợ', icon: Users },
  { href: '/ai', label: 'Trợ lý AI', icon: Bot },
] as const;

const NAV_PHU = [
  { href: '/budgets', label: 'Ngân sách', icon: ChartPie },
  { href: '/goals', label: 'Mục tiêu', icon: Target },
  { href: '/debts', label: 'Khoản nợ', icon: PiggyBank },
  { href: '/reports', label: 'Báo cáo', icon: ListTree },
  { href: '/categories', label: 'Danh mục', icon: LayoutGrid },
] as const;

type MucNav = (typeof NAV_CHINH)[number] | (typeof NAV_PHU)[number];

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

function MucNavItem({
  href,
  label,
  icon: Icon,
  pathname,
  onClick,
}: MucNav & { pathname: string; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
        pathname.startsWith(href)
          ? 'bg-brand text-white elevation-brand'
          : 'hover:bg-[var(--surface-2)]'
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
  const [moThem, setMoThem] = useState(false);

  // Tab "Thêm" phải sáng lên khi đang ở một trong các trang thuộc nhóm phụ, không thì
  // người dùng vào /budgets rồi nhìn xuống tab bar thấy không có mục nào được chọn
  const dangONhomPhu = NAV_PHU.some((n) => pathname.startsWith(n.href));

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar — desktop */}
      <aside className="surface sticky top-0 hidden h-dvh w-60 shrink-0 flex-col p-4 md:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2">
          <span className="elevation-brand flex size-9 items-center justify-center rounded-xl bg-brand text-white">
            <Wallet size={18} />
          </span>
          <span className="text-lg font-bold tracking-tight">Spendly</span>
        </Link>

        <nav className="flex-1 space-y-1">
          {NAV_CHINH.map((n) => (
            <MucNavItem key={n.href} {...n} pathname={pathname} />
          ))}

          <div className="my-2 border-t" />

          {NAV_PHU.map((n) => (
            <MucNavItem key={n.href} {...n} pathname={pathname} />
          ))}
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
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="elevation-brand flex size-8 items-center justify-center rounded-lg bg-brand text-white">
            <Wallet size={16} />
          </span>
          <span className="font-bold tracking-tight">Spendly</span>
        </Link>
        <ThemeToggle />
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
            dangONhomPhu ? 'text-brand' : 'muted'
          }`}
        >
          <LayoutGrid size={20} />
          Thêm
        </button>
      </nav>

      {/* Sheet "Thêm" — mobile, gom nhóm phụ để tab bar không quá 5 mục */}
      <Modal open={moThem} onClose={() => setMoThem(false)} title="Thêm">
        <div className="space-y-1">
          {NAV_PHU.map((n) => (
            <MucNavItem key={n.href} {...n} pathname={pathname} onClick={() => setMoThem(false)} />
          ))}
        </div>
      </Modal>
    </div>
  );
}
