import { AppShell } from '@/components/layout/AppShell';

// Route group `(app)` — gom mọi trang cần đăng nhập vào chung một layout,
// không tạo thêm cấp đường dẫn
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return <AppShell>{children}</AppShell>;
}
