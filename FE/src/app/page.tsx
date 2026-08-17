'use client';

import { LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Cổng vào: đưa user tới đúng nơi tùy trạng thái phiên.
 *
 * Phải đợi `hydrated` — đọc store trước khi localStorage được nạp sẽ luôn thấy
 * `accessToken = null` và đá người đang đăng nhập ra màn hình login.
 */
export default function Home() {
  const router = useRouter();
  const { accessToken, user, hydrated } = useAuthStore();

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) router.replace('/auth/login');
    else if (!user?.onboardedAt) router.replace('/onboarding');
    else router.replace('/dashboard');
  }, [hydrated, accessToken, user, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <LoaderCircle className="animate-spin text-brand" size={32} />
    </div>
  );
}
