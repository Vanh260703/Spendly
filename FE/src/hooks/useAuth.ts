'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { authApi, usersApi } from '@/lib/api';
import type { ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

const loi = (e: unknown) => (e as ApiError).message ?? 'Đã có lỗi xảy ra';

/** Điều hướng sau khi có phiên: chưa onboarding thì vào thiết lập, rồi mới tới dashboard */
function useVaoApp() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  return (data: { user: { id: string; email: string; name: string; onboardedAt: string | null } ; accessToken: string }) => {
    setSession(data.user, data.accessToken);
    router.replace(data.user.onboardedAt ? '/dashboard' : '/onboarding');
  };
}

export function useLogin() {
  const vaoApp = useVaoApp();

  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      toast.success(`Chào ${data.user.name}`);
      vaoApp(data);
    },
    onError: (e) => toast.error(loi(e)),
  });
}

export function useRegister() {
  const vaoApp = useVaoApp();

  return useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => {
      toast.success('Tạo tài khoản thành công');
      vaoApp(data);
    },
    onError: (e) => toast.error(loi(e)),
  });
}

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useAuthStore((s) => s.logout);

  return useMutation({
    mutationFn: authApi.logout,
    // Dùng onSettled: kể cả gọi API thất bại vẫn phải đăng xuất phía client,
    // không để user kẹt trong app khi mạng lỗi
    onSettled: () => {
      logout();
      queryClient.clear();
      router.replace('/auth/login');
    },
  });
}

export function useOnboarding() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: usersApi.onboarding,
    onSuccess: (user) => {
      setUser({
        id: user.id,
        email: user.email,
        name: user.name,
        onboardedAt: user.onboardedAt,
      });
      toast.success('Thiết lập xong, bắt đầu ghi chép thôi');
      router.replace('/dashboard');
    },
    onError: (e) => toast.error(loi(e)),
  });
}
