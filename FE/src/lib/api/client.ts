export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/** Lỗi có mã HTTP để hook/UI phân biệt được 404 · 409 · 400 mà xử lý khác nhau */
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
}

/**
 * Gọi API.
 *
 * ⚠️ **Không có token, không có refresh.** App phục vụ một người duy nhất và BE không còn
 * đăng nhập — mọi endpoint đều mở. Toàn bộ an toàn nằm ở chỗ API không lộ ra Internet;
 * nếu mở tunnel thì chỉ mở đúng đường `/api/v1/webhooks/sepay`.
 */
async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

  // 204 No Content — không có gì để parse
  if (res.status === 204) return undefined as T;

  const json = (await res.json().catch(() => null)) as
    | { success: boolean; data?: T; message?: string }
    | null;

  if (!res.ok || !json?.success) {
    throw new ApiError(json?.message ?? 'Không kết nối được máy chủ', res.status);
  }

  return json.data as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
