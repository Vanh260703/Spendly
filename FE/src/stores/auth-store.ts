import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  onboardedAt: string | null;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  /** false cho tới khi đọc xong localStorage — tránh nháy màn hình đăng nhập khi F5 */
  hydrated: boolean;
  setSession: (user: AuthUser, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;
  setHydrated: () => void;
}

/**
 * Phiên đăng nhập.
 *
 * **Chỉ lưu access token** (hạn 15 phút). Refresh token nằm trong httpOnly cookie do BE
 * đặt — JavaScript không đọc được, nên lỗ hổng XSS trên FE cũng không lấy được thứ có
 * hạn dài nhất.
 *
 * `skipHydration: true` + `StoreHydrator`: Next render trước ở server nơi không có
 * localStorage; để zustand tự hydrate sẽ gây lệch HTML server/client.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      hydrated: false,

      setSession: (user, accessToken) => set({ user, accessToken }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) => set({ user }),
      logout: () => set({ user: null, accessToken: null }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'spendly-auth',
      skipHydration: true,
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken }),
    },
  ),
);
