/** Token để inject raw ioredis client khi cần thao tác nâng cao (pipeline, pub/sub, BullMQ). */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Nơi tập trung MỌI key Redis của dự án.
 *
 * Đừng viết chuỗi key thẳng trong service — gõ sai một ký tự là cache không bao giờ trúng,
 * mà lỗi này im lặng: app vẫn chạy đúng, chỉ chậm và tốn quota AI. Gom về một chỗ thì
 * còn nhìn ra được toàn bộ không gian key và tránh trùng tiền tố.
 */
export const RedisKeys = {
  /** Cache thống kê — TTL ngắn, xóa ngay khi user thêm/sửa/xóa giao dịch */
  stats: (userId: string, scope: string, suffix = '') =>
    `stats:${userId}:${scope}${suffix ? `:${suffix}` : ''}`,

  /** Tiền tố để xóa toàn bộ cache thống kê của một user */
  statsPrefix: (userId: string) => `stats:${userId}:`,

  /** Cache kết quả AI theo dấu vân tay dữ liệu đầu vào — TTL dài (7–30 ngày) */
  aiInsight: (userId: string, kind: string, inputHash: string) =>
    `ai:${userId}:${kind}:${inputHash}`,

  /** Bộ đếm số lượt gọi AI trong ngày (chống đụng trần quota Grok free) */
  aiDailyCount: (userId: string, yyyymmdd: string) =>
    `ratelimit:ai:${userId}:${yyyymmdd}`,

  /** Whitelist refresh token — có mặt = còn hiệu lực, xóa = đã logout */
  refreshToken: (userId: string, jti: string) => `refresh:${userId}:${jti}`,

  /** Tiền tố để thu hồi TẤT CẢ refresh token của user (khi đổi mật khẩu) */
  refreshTokenPrefix: (userId: string) => `refresh:${userId}:`,
} as const;

/** TTL mặc định, tính bằng giây */
export const RedisTtl = {
  /** Thống kê: đủ ngắn để không lệch lâu, đủ dài để chịu được reload liên tục */
  STATS: 5 * 60,
  /** Kết quả AI: dữ liệu không đổi thì không việc gì phải gọi lại API */
  AI_INSIGHT: 7 * 24 * 60 * 60,
  /** Bộ đếm rate limit AI: hết ngày là reset */
  AI_DAILY: 24 * 60 * 60,
} as const;
