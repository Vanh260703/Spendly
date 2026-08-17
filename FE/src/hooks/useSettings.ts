'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { categoriesApi, usersApi, walletApi } from '@/lib/api';
import type { ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

const loi = (e: unknown) => (e as ApiError).message ?? 'Đã có lỗi xảy ra';

export const useProfile = () =>
  useQuery({ queryKey: ['profile'], queryFn: usersApi.me });

export function useUpdateProfile() {
  const qc = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: usersApi.update,
    onSuccess: (u) => {
      void qc.invalidateQueries({ queryKey: ['profile'] });
      // Đồng bộ tên hiển thị trên sidebar ngay, khỏi phải F5
      setUser({ id: u.id, email: u.email, name: u.name, onboardedAt: u.onboardedAt });

      // monthStartDay đổi thì ranh giới kỳ đổi theo → mọi số liệu theo kỳ đều sai
      for (const k of ['summary', 'by-category', 'trend', 'calendar', 'budgets']) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
      toast.success('Đã lưu cài đặt');
    },
    onError: (e) => toast.error(loi(e)),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: usersApi.changePassword,
    onSuccess: () =>
      toast.success('Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.'),
    onError: (e) => toast.error(loi(e)),
  });
}

export function useUpdateWallet() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: walletApi.update,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
      // initialBalance là thành phần của công thức số dư → mọi thống kê phải tính lại
      void qc.invalidateQueries({ queryKey: ['balance'] });
      toast.success('Đã cập nhật ví');
    },
    onError: (e) => toast.error(loi(e)),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      categoriesApi.update(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categories'] });
      // Tên và màu danh mục nằm trong payload thống kê đã cache
      void qc.invalidateQueries({ queryKey: ['by-category'] });
      toast.success('Đã cập nhật danh mục');
    },
    onError: (e) => toast.error(loi(e)),
  });
}
