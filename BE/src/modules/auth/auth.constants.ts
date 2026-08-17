/** Tên cookie chứa refresh token */
export const REFRESH_COOKIE = 'spendly_rt';

/**
 * Cookie chỉ được gửi kèm cho các route auth thay vì mọi request.
 * Thu hẹp phạm vi = giảm bề mặt tấn công; refresh token không cần có mặt ở chỗ khác.
 */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** Payload của access token */
export interface AccessTokenPayload {
  sub: string;
  email: string;
}

/** Payload của refresh token — `jti` là khóa tra whitelist trong Redis */
export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

/**
 * Đổi chuỗi kiểu `15m` / `7d` sang giây.
 *
 * Cần vì JWT nhận chuỗi thời hạn, còn Redis TTL và cookie `maxAge` cần số. Hai nơi phải
 * khớp nhau: token còn hạn mà whitelist đã hết TTL (hoặc ngược lại) sẽ sinh ra lỗi
 * đăng xuất ngẫu nhiên rất khó lần.
 */
export function parseDurationToSeconds(input: string): number {
  const m = /^(\d+)\s*([smhd])$/.exec(input.trim());
  if (!m) throw new Error(`Thời hạn không hợp lệ: "${input}" (mong đợi dạng 15m, 7d)`);

  const value = Number(m[1]);
  const unit = m[2] as 's' | 'm' | 'h' | 'd';
  return value * { s: 1, m: 60, h: 3600, d: 86400 }[unit];
}
