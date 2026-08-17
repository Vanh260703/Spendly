import { useAuthStore } from '@/stores/auth-store';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/** Lỗi có mã HTTP để hook/UI phân biệt được 401 · 409 · 503 mà xử lý khác nhau */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Cờ nội bộ: chặn lặp vô hạn khi chính request refresh cũng trả 401 */
  _daThuRefresh?: boolean;
}

/**
 * Gộp nhiều request 401 xảy ra cùng lúc vào MỘT lần gọi refresh.
 *
 * Không có nó thì mở dashboard (5–6 query song song) lúc token vừa hết hạn sẽ bắn 6 lần
 * refresh cùng lúc — mà refresh token **xoay vòng** sau mỗi lần dùng, nên 5 lần sau đều
 * thất bại và user bị đá ra đăng nhập oan.
 */
let dangRefresh: Promise<boolean> | null = null;

async function refreshToken(): Promise<boolean> {
  dangRefresh ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // refresh token nằm trong httpOnly cookie
      });
      if (!res.ok) return false;

      const json = (await res.json()) as { data: { accessToken: string } };
      useAuthStore.getState().setAccessToken(json.data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      // Nhả khóa ở microtask kế tiếp để các request đang chờ kịp đọc kết quả
      queueMicrotask(() => {
        dangRefresh = null;
      });
    }
  })();

  return dangRefresh;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, _daThuRefresh, headers, ...rest } = options;
  const token = useAuthStore.getState().accessToken;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

  // Access token hết hạn (15 phút) → xin token mới rồi thử lại đúng MỘT lần
  if (res.status === 401 && !_daThuRefresh) {
    if (await refreshToken()) {
      return apiFetch<T>(path, { ...options, _daThuRefresh: true });
    }
    useAuthStore.getState().logout();
    throw new ApiError('Phiên đăng nhập đã hết hạn', 401);
  }

  if (res.status === 204) return undefined as T;

  const json = (await res.json().catch(() => null)) as
    | { success: boolean; data?: T; message?: string }
    | null;

  if (!res.ok) {
    throw new ApiError(json?.message ?? 'Đã có lỗi xảy ra', res.status);
  }

  return json?.data as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
