'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Đọc localStorage vào zustand SAU khi mount.
 *
 * Store đặt `skipHydration: true` vì Next render lần đầu ở server nơi không có
 * localStorage — để zustand tự hydrate sẽ gây lệch HTML giữa server và client.
 */
function StoreHydrator() {
  useEffect(() => {
    void useAuthStore.persist.rehydrate();
    useAuthStore.getState().setHydrated();
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Không tự thử lại lỗi 4xx: sai dữ liệu hay hết phiên thì gọi lại
            // bao nhiêu lần cũng vẫn hỏng, chỉ làm user chờ lâu hơn
            retry: (soLan, err) => {
              const status = (err as { status?: number })?.status ?? 0;
              return status >= 500 && soLan < 2;
            },
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <StoreHydrator />
      {children}
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}
