'use client';

import { LogOut, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdjustBalanceCard } from '@/components/settings/AdjustBalanceCard';
import { Button, Card, CardTitle, Field, Input, MoneyInput, Select, Skeleton } from '@/components/ui';
import { useLogout } from '@/hooks/useAuth';
import {
  useChangePassword, useProfile, useUpdateProfile, useUpdateWallet,
} from '@/hooks/useSettings';

export default function SettingsPage() {
  const { data: profile, isLoading } = useProfile();
  const luuHoSo = useUpdateProfile();
  const luuVi = useUpdateWallet();
  const doiMatKhau = useChangePassword();
  const logout = useLogout();

  const [hoSo, setHoSo] = useState<{ name: string; monthStartDay: number; monthlyIncome: number | '' }>({ name: '', monthStartDay: 1, monthlyIncome: '' });
  const [vi, setVi] = useState<{ name: string; initialBalance: number | '' }>({ name: '', initialBalance: '' });
  const [mk, setMk] = useState({ currentPassword: '', newPassword: '' });

  // Đổ dữ liệu vào form khi tải xong — form là "uncontrolled từ server", chỉ nạp một lần
  useEffect(() => {
    if (!profile) return;
    setHoSo({
      name: profile.name,
      monthStartDay: profile.monthStartDay,
      monthlyIncome: profile.monthlyIncome ?? '',
    });
    if (profile.wallet) {
      setVi({
        name: profile.wallet.name,
        initialBalance: profile.wallet.initialBalance,
      });
    }
  }, [profile]);

  if (isLoading) return <Skeleton className="mx-auto h-96 max-w-2xl" />;

  const soDuBanDauDoi =
    profile?.wallet && Number(vi.initialBalance) !== profile.wallet.initialBalance;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Cài đặt</h1>

      {/* ————— Hồ sơ ————— */}
      <Card>
        <CardTitle>Hồ sơ</CardTitle>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            luuHoSo.mutate({
              name: hoSo.name,
              monthStartDay: Number(hoSo.monthStartDay),
              monthlyIncome: hoSo.monthlyIncome ? Number(hoSo.monthlyIncome) : null,
            });
          }}
          className="space-y-4"
        >
          <Field label="Email">
            {/* Email là danh tính đăng nhập — BE không cho đổi */}
            <Input value={profile?.email ?? ''} disabled className="opacity-60" />
          </Field>

          <Field label="Tên hiển thị">
            <Input
              value={hoSo.name}
              onChange={(e) => setHoSo({ ...hoSo, name: e.target.value })}
              required
            />
          </Field>

          <Field
            label="Ngày bắt đầu chu kỳ tháng"
            hint="Đặt theo ngày nhận lương nếu 'tháng tài chính' của bạn không trùng tháng dương lịch. Áp dụng cho cả ngân sách, thống kê và báo cáo AI."
          >
            <Select
              value={hoSo.monthStartDay}
              onChange={(e) => setHoSo({ ...hoSo, monthStartDay: Number(e.target.value) })}
            >
              {/* Chỉ tới 28 vì tháng 2 không có ngày 29–31 */}
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  Ngày {d}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Thu nhập hàng tháng"
            hint="Dùng để gợi ý ngân sách 50/30/20 và để AI quy đổi '% trên thu nhập'"
          >
            <MoneyInput
              value={hoSo.monthlyIncome}
              onChange={(v) => setHoSo({ ...hoSo, monthlyIncome: v })}
              placeholder="0"
            />
          </Field>

          <Button type="submit" loading={luuHoSo.isPending}>Lưu hồ sơ</Button>
        </form>
      </Card>

      {/* ————— Ví ————— */}
      <Card>
        <CardTitle>Ví</CardTitle>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            luuVi.mutate({ name: vi.name, initialBalance: Number(vi.initialBalance) });
          }}
          className="space-y-4"
        >
          <Field label="Tên ví">
            <Input value={vi.name} onChange={(e) => setVi({ ...vi, name: e.target.value })} required />
          </Field>

          <Field
            label="Số dư ban đầu"
            hint="Số tiền bạn có lúc bắt đầu dùng app. Lương tháng sau về thì ghi giao dịch thu, KHÔNG sửa ở đây."
          >
            <MoneyInput
              value={vi.initialBalance}
              onChange={(v) => setVi({ ...vi, initialBalance: v })}
              required
            />
          </Field>

          {/* Cảnh báo chỉ hiện khi user thực sự định đổi — nhắc suông sẽ bị bỏ qua */}
          {soDuBanDauDoi && (
            <p className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-sm text-warning">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <span>
                Đổi số dư ban đầu sẽ <strong>dịch chuyển toàn bộ lịch sử</strong> — mọi kỳ trong
                quá khứ đều đổi số. Chỉ dùng khi khai sai lúc thiết lập ban đầu. Nếu app lệch với
                tiền thật do quên nhập, hãy dùng &ldquo;Điều chỉnh số dư&rdquo; bên dưới.
              </span>
            </p>
          )}

          <Button type="submit" loading={luuVi.isPending} variant="secondary">
            Lưu ví
          </Button>
        </form>
      </Card>

      <AdjustBalanceCard />

      {/* ————— Mật khẩu ————— */}
      <Card>
        <CardTitle>Đổi mật khẩu</CardTitle>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            doiMatKhau.mutate(mk, {
              onSuccess: () => setMk({ currentPassword: '', newPassword: '' }),
            });
          }}
          className="space-y-4"
        >
          <Field label="Mật khẩu hiện tại">
            <Input
              value={mk.currentPassword}
              onChange={(e) => setMk({ ...mk, currentPassword: e.target.value })}
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>

          <Field
            label="Mật khẩu mới"
            hint="Ít nhất 8 ký tự. Đổi xong, các thiết bị khác sẽ bị đăng xuất."
          >
            <Input
              value={mk.newPassword}
              onChange={(e) => setMk({ ...mk, newPassword: e.target.value })}
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>

          <Button type="submit" loading={doiMatKhau.isPending} variant="secondary">
            Đổi mật khẩu
          </Button>
        </form>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">Đăng xuất</p>
            <p className="muted text-sm">Bạn đang đăng nhập bằng {profile?.email}</p>
          </div>
          <Button variant="danger" onClick={() => logout.mutate()} loading={logout.isPending}>
            <LogOut size={16} /> Đăng xuất
          </Button>
        </div>
      </Card>
    </div>
  );
}
