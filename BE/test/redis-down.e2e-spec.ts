import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { RedisService } from '../src/shared/redis';
import { createTestApp, truncateAll, uniqueEmail } from './utils/test-app';

const API = '/api/v1';

/**
 * Test hồi quy cho một bug THẬT đã xảy ra.
 *
 * Trước đây `allowRefreshToken()` gọi thẳng Redis client. Khi Redis chết:
 * `POST /auth/register` trả **500 trong khi user đã được tạo trong DB** → user thử lại
 * nhận `409 email đã tồn tại`, login cũng lỗi, **tài khoản kẹt hoàn toàn**.
 *
 * Nguyên tắc của dự án (SPEC §7): mất Redis thì app CHẬM ĐI chứ không GÃY.
 * File này khóa nguyên tắc đó lại để không ai vô tình phá vỡ.
 *
 * Cách mô phỏng: dựng app bình thường rồi **ngắt kết nối của chính app đó**
 * (`client.disconnect()` — ioredis không tự kết nối lại sau lệnh này).
 *
 * Cố ý KHÔNG đổi `REDIS_PORT` qua `process.env`: `ConfigModule.forRoot()` chạy ngay lúc
 * import `app.module.ts`, tức là trước cả `beforeAll`, nên đổi env lúc đó là quá muộn —
 * app vẫn nối vào Redis thật và test xanh giả. Ngắt kết nối trực tiếp thì chắc chắn đúng
 * trạng thái cần test, và cũng không đụng gì tới Redis của máy dev.
 */
describe('Redis chết — app vẫn phải chạy (e2e)', () => {
  let app: INestApplication;
  let server: unknown;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app, server, dataSource } = await createTestApp());

    const redis = app.get(RedisService);
    const client = redis.getClient();

    // Đợi kết nối HOÀN TẤT rồi mới ngắt. Ngắt giữa chừng lúc đang connect sẽ để lại
    // socket treo khiến tiến trình test không thoát được.
    if (client.status !== 'ready') {
      await new Promise<void>((resolve) => {
        // Phải clear timer khi resolve sớm, nếu không chính nó lại là handle treo
        const hen = setTimeout(() => resolve(), 3000);
        const xong = () => {
          clearTimeout(hen);
          resolve();
        };
        client.once('ready', xong);
        client.once('error', xong);
      });
    }

    client.disconnect();
    await new Promise((r) => setTimeout(r, 200));

    // Chốt lại rằng ta THỰC SỰ đang test với Redis chết — nếu không, mọi assert
    // phía dưới đều vô nghĩa và bug sẽ lọt qua như đã từng xảy ra
    expect(redis.isReady).toBe(false);
  });

  afterAll(async () => {
    await truncateAll(dataSource);
    await app.close();
  });

  it('đăng ký vẫn thành công (201), không để lại user mồ côi', async () => {
    const email = uniqueEmail('redis-down');
    const res = await request(server as never)
      .post(`${API}/auth/register`)
      .send({ email, password: 'matkhau123', name: 'X' })
      .expect(201);

    expect(res.body.data.accessToken).toEqual(expect.any(String));

    const [{ count }] = await dataSource.query(
      'SELECT count(*)::int FROM users WHERE email = $1',
      [email],
    );
    expect(count).toBe(1);
  });

  it('đăng nhập, refresh, logout đều vẫn hoạt động (whitelist fail-open)', async () => {
    const email = uniqueEmail('redis-down');
    await request(server as never)
      .post(`${API}/auth/register`)
      .send({ email, password: 'matkhau123', name: 'X' })
      .expect(201);

    const login = await request(server as never)
      .post(`${API}/auth/login`)
      .send({ email, password: 'matkhau123' })
      .expect(200);

    const cookie = (login.headers['set-cookie'] as unknown as string[])[0];

    await request(server as never)
      .post(`${API}/auth/refresh`)
      .set('Cookie', cookie)
      .expect(200);

    await request(server as never)
      .post(`${API}/auth/logout`)
      .set('Cookie', cookie)
      .expect(204);
  });

  it('đọc/ghi dữ liệu vẫn bình thường (cache miss thì tính lại từ Postgres)', async () => {
    const email = uniqueEmail('redis-down');
    const reg = await request(server as never)
      .post(`${API}/auth/register`)
      .send({ email, password: 'matkhau123', name: 'X' })
      .expect(201);

    const auth = { Authorization: `Bearer ${reg.body.data.accessToken}` };

    await request(server as never).get(`${API}/users/me`).set(auth).expect(200);
    await request(server as never).get(`${API}/wallet`).set(auth).expect(200);
    await request(server as never).get(`${API}/categories`).set(auth).expect(200);

    // Ghi có kèm invalidate cache — delByPrefix lỗi cũng không được chặn nghiệp vụ
    const cat = await request(server as never)
      .post(`${API}/categories`)
      .set(auth)
      .send({
        name: 'Khi Redis chết',
        type: 'expense',
        kind: 'want',
        icon: 'x',
        color: '#123456',
      })
      .expect(201);

    await request(server as never)
      .delete(`${API}/categories/${cat.body.data.id}`)
      .set(auth)
      .expect(200);
  });
});
