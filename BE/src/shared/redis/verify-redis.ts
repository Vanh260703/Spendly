/**
 * Kiểm chứng RedisService trên Redis thật. Chạy: npm run verify:redis
 *
 * Điều quan trọng nhất cần chứng minh: **mất Redis thì app chậm đi chứ không gãy**
 * (SPEC §7). Test cuối cùng ngắt kết nối rồi gọi lại để xác nhận không có exception nào
 * lọt ra ngoài.
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import Redis from 'ioredis';
import { RedisKeys, RedisTtl } from './redis.constants';
import { RedisService } from './redis.service';

loadEnv();

async function main() {
  const client = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    // Tự kết nối thì phải đợi sự kiện 'ready'; lazyConnect cho phép await thẳng
    lazyConnect: true,
  });
  await client.connect();

  const redis = new RedisService(client);
  let ok = true;
  const check = (nhan: string, dieuKien: boolean, thucTe?: unknown) => {
    console.log(
      `${dieuKien ? '✅' : '❌'} ${nhan}` +
        (thucTe === undefined ? '' : ` → ${JSON.stringify(thucTe)}`),
    );
    if (!dieuKien) ok = false;
  };

  const uid = `test-${Date.now()}`;

  try {
    check('Kết nối được Redis', await redis.ping());

    // 1. set/get JSON
    const key = RedisKeys.stats(uid, 'summary', '2026-08');
    await redis.set(key, { income: 20_000_000, expense: 8_250_000 }, 60);
    const got = await redis.get<{ income: number; expense: number }>(key);
    check('set/get round-trip giữ nguyên number', got?.income === 20_000_000, got);

    // 2. Cache miss trả null, không ném lỗi
    check('Miss trả null', (await redis.get('khong:ton:tai')) === null);

    // 3. remember() — miss thì gọi factory, hit thì không gọi lại
    let goiFactory = 0;
    const kRemember = RedisKeys.stats(uid, 'balance');
    const l1 = await redis.remember(kRemember, 60, async () => {
      goiFactory++;
      return { currentBalance: 31_000_000 };
    });
    const l2 = await redis.remember(kRemember, 60, async () => {
      goiFactory++;
      return { currentBalance: 999 };
    });
    check('remember(): lần 2 lấy từ cache, không gọi lại factory', goiFactory === 1, {
      soLanGoi: goiFactory,
    });
    check('remember(): giá trị nhất quán', l1.currentBalance === l2.currentBalance);

    // 4. delByPrefix — invalidate toàn bộ stats của user khi có giao dịch mới
    await redis.set(RedisKeys.stats(uid, 'by-category'), [1, 2, 3], 60);
    await redis.set(RedisKeys.stats(uid, 'trend'), [4, 5], 60);
    const daXoa = await redis.delByPrefix(RedisKeys.statsPrefix(uid));
    check('delByPrefix xóa hết cache stats của user', daXoa >= 3, { daXoa });
    check('Sau khi xóa thì miss', (await redis.get(kRemember)) === null);

    // 5. Rate limit — TTL chỉ đặt ở lần đầu, không gia hạn mỗi lượt
    const kLimit = RedisKeys.aiDailyCount(uid, '20260813');
    const c1 = await redis.incrDaily(kLimit, RedisTtl.AI_DAILY);
    const c2 = await redis.incrDaily(kLimit, RedisTtl.AI_DAILY);
    const c3 = await redis.incrDaily(kLimit, RedisTtl.AI_DAILY);
    check('incrDaily đếm đúng 1→2→3', c1 === 1 && c2 === 2 && c3 === 3, [c1, c2, c3]);
    const ttl = await client.ttl(kLimit);
    check('TTL được đặt và không bị gia hạn', ttl > 0 && ttl <= RedisTtl.AI_DAILY, { ttl });

    // 6. Refresh token whitelist
    const kToken = RedisKeys.refreshToken(uid, 'jti-abc');
    await redis.allowRefreshToken(kToken, 60);
    check('Token trong whitelist', await redis.isRefreshTokenAllowed(kToken));
    await redis.del(kToken);
    check('Sau logout thì token bị thu hồi', !(await redis.isRefreshTokenAllowed(kToken)));

    // 7. QUAN TRỌNG NHẤT — Redis chết thì app không được gãy
    await redis.delByPrefix(`${uid}`);
    client.disconnect();
    await new Promise((r) => setTimeout(r, 100));

    const khiChet = await redis.get('bat:ky:key:nao');
    check('Redis chết: get() trả null thay vì ném lỗi', khiChet === null);
    await redis.set('bat:ky', { a: 1 }, 60);
    check('Redis chết: set() im lặng bỏ qua, không ném lỗi', true);
    check('Redis chết: ping() trả false', (await redis.ping()) === false);
  } catch (err) {
    console.error('\n❌ Có exception lọt ra ngoài:', (err as Error).message);
    ok = false;
  } finally {
    client.disconnect();
  }

  console.log(ok ? '\n✅ TẤT CẢ ĐỀU ĐÚNG' : '\n❌ CÓ LỖI');
  process.exit(ok ? 0 : 1);
}

void main();
