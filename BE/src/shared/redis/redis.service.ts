import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Bọc quanh ioredis với một nguyên tắc xuyên suốt: **Redis là cache, không phải nơi lưu bền**.
 *
 * Mất Redis thì app phải CHẬM ĐI chứ không được GÃY. Vì vậy mọi thao tác đọc/ghi đều
 * được bọc trong `safe()`: Redis chết thì `get` trả `null` (coi như cache miss, service
 * tự tính lại từ Postgres) và `set` im lặng bỏ qua. Không bao giờ ném lỗi ra ngoài.
 *
 * Ngoại lệ DUY NHẤT là `incrDaily()` — dùng cho rate limit AI. Ở đó lỗi phải nổ ra,
 * vì không đếm được lượt gọi mà vẫn cho gọi thì sẽ đốt sạch quota Grok free.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  /** Raw client — dùng khi cần pipeline, pub/sub, hoặc truyền cho BullMQ */
  getClient(): Redis {
    return this.client;
  }

  /** `true` khi kết nối sẵn sàng nhận lệnh */
  get isReady(): boolean {
    return this.client.status === 'ready';
  }

  // ————————————————————— Cache —————————————————————

  /** Đọc và parse JSON. Trả `null` khi miss, khi parse lỗi, hoặc khi Redis chết. */
  async get<T>(key: string): Promise<T | null> {
    return this.safe(async () => {
      const raw = await this.client.get(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        // Dữ liệu hỏng hoặc đổi format — xóa đi rồi coi như miss
        await this.client.del(key);
        return null;
      }
    }, null);
  }

  /** Ghi JSON kèm TTL (giây). TTL là bắt buộc — key cache không có hạn sẽ rò rỉ bộ nhớ. */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.safe(async () => {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return null;
    }, null);
  }

  /**
   * Đọc cache, miss thì gọi `factory()` để tính rồi ghi lại.
   * Đây là hàm nên dùng ở hầu hết chỗ, thay vì tự `get` rồi `set`.
   */
  async remember<T>(
    key: string,
    ttlSeconds: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const fresh = await factory();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.safe(async () => {
      await this.client.del(...keys);
      return null;
    }, null);
  }

  /**
   * Xóa mọi key theo tiền tố — dùng để invalidate toàn bộ cache thống kê của một user
   * ngay khi họ thêm/sửa/xóa giao dịch.
   *
   * Dùng `SCAN` chứ **không** `KEYS`: `KEYS` chặn toàn bộ Redis trong lúc quét,
   * còn `SCAN` chia nhỏ thành nhiều vòng nên không làm nghẽn các request khác.
   */
  async delByPrefix(prefix: string): Promise<number> {
    return (
      (await this.safe(async () => {
        let cursor = '0';
        let deleted = 0;

        do {
          const [next, keys] = await this.client.scan(
            cursor,
            'MATCH',
            `${prefix}*`,
            'COUNT',
            200,
          );
          cursor = next;
          if (keys.length > 0) {
            deleted += await this.client.del(...keys);
          }
        } while (cursor !== '0');

        return deleted;
      }, 0)) ?? 0
    );
  }

  // ————————————————————— Rate limit —————————————————————

  /**
   * Tăng bộ đếm và trả về giá trị sau khi tăng. TTL chỉ được đặt ở lần tăng đầu tiên,
   * nên cửa sổ đếm tính từ lượt gọi đầu chứ không bị gia hạn mỗi lần gọi.
   *
   * ⚠️ **Cố ý KHÔNG bọc `safe()`** — Redis chết thì phải ném lỗi. Không đếm được mà vẫn
   * cho gọi AI thì sẽ đốt sạch quota; thà chặn còn hơn.
   */
  async incrDaily(key: string, ttlSeconds: number): Promise<number> {
    const [[, count]] = (await this.client
      .multi()
      .incr(key)
      .expire(key, ttlSeconds, 'NX') // NX = chỉ đặt TTL khi key chưa có hạn
      .exec()) as [[Error | null, number], [Error | null, number]];

    return count;
  }

  // ————————————————————— Session —————————————————————

  /**
   * Đưa refresh token vào whitelist. Có mặt = còn hiệu lực.
   *
   * Suy giảm êm khi Redis chết: nếu ném lỗi ở đây thì **đăng ký/đăng nhập sẽ trả 500
   * trong khi user đã được tạo trong DB** — user thử lại nhận `409 email đã tồn tại`,
   * login cũng lỗi, tài khoản kẹt hoàn toàn. Redis chết không được phép làm hỏng auth.
   */
  async allowRefreshToken(key: string, ttlSeconds: number): Promise<void> {
    await this.safe(async () => {
      await this.client.set(key, '1', 'EX', ttlSeconds);
      return null;
    }, null);
  }

  /**
   * Kiểm tra refresh token còn trong whitelist không.
   *
   * **Fail-open có chủ đích**: Redis không kết nối được → trả `true`.
   *
   * Đánh đổi đã cân nhắc: fail-closed sẽ khiến mọi người bị đăng xuất và không đăng nhập
   * lại được mỗi lần Redis chớp — với app cá nhân đó là hỏng hẳn. Fail-open thì mất khả
   * năng THU HỒI token trong lúc Redis chết, nhưng token vẫn phải có **chữ ký hợp lệ** và
   * **còn hạn** mới qua được — nên cửa sổ rủi ro hẹp và cần đã chiếm được token từ trước.
   *
   * Redis SỐNG mà không thấy key → trả `false` (đã logout / đổi mật khẩu). Thu hồi vẫn
   * hoạt động bình thường trong điều kiện bình thường.
   */
  async isRefreshTokenAllowed(key: string): Promise<boolean> {
    if (!this.isReady) {
      this.logger.warn(
        'Redis không sẵn sàng — bỏ qua kiểm tra whitelist refresh token (fail-open)',
      );
      return true;
    }

    try {
      return (await this.client.exists(key)) === 1;
    } catch (err) {
      this.logger.warn(`Redis lỗi khi kiểm tra whitelist, fail-open: ${(err as Error).message}`);
      return true;
    }
  }

  // ————————————————————— Nội bộ —————————————————————

  async ping(): Promise<boolean> {
    return this.safe(async () => (await this.client.ping()) === 'PONG', false);
  }

  /**
   * Chạy thao tác Redis, nuốt lỗi và trả `fallback`.
   * Log ở mức `warn` chứ không `error` — Redis chết là chuyện suy giảm hiệu năng,
   * không phải sự cố dữ liệu.
   */
  private async safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    if (!this.isReady) return fallback;
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(
        `Redis lỗi, bỏ qua và chạy tiếp: ${(err as Error).message}`,
      );
      return fallback;
    }
  }

  /**
   * Đóng kết nối khi app tắt.
   *
   * `quit()` ném `Connection is closed` nếu Redis đã chết từ trước — mà tắt app thì không
   * được phép lỗi chỉ vì một dịch vụ phụ đã ngừng. Nuốt lỗi và `disconnect()` để chắc chắn
   * socket được giải phóng, tránh treo tiến trình lúc thoát.
   */
  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
