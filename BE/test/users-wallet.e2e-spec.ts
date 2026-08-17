import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { registerUser } from './utils/auth-helper';
import { createTestApp, truncateAll } from './utils/test-app';

const API = '/api/v1';

describe('Users & Wallet (e2e)', () => {
  let app: INestApplication;
  let server: unknown;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app, server, dataSource } = await createTestApp());
  });

  afterAll(async () => {
    await truncateAll(dataSource);
    await app.close();
  });

  describe('GET /wallet', () => {
    it('mỗi user được tạo sẵn đúng 1 ví, số dư 0 trước onboarding', async () => {
      const user = await registerUser(server);
      const res = await request(server as never)
        .get(`${API}/wallet`)
        .set(user.auth)
        .expect(200);

      expect(res.body.data).toEqual({
        id: expect.any(String),
        name: 'Ví chính',
        initialBalance: 0,
        startedAt: null,
      });
    });

    it('initialBalance là number, không phải string (MoneyTransformer)', async () => {
      const user = await registerUser(server);
      await request(server as never)
        .patch(`${API}/wallet`)
        .set(user.auth)
        .send({ initialBalance: 12_000_000 })
        .expect(200);

      const res = await request(server as never).get(`${API}/wallet`).set(user.auth);
      expect(typeof res.body.data.initialBalance).toBe('number');
      expect(res.body.data.initialBalance).toBe(12_000_000);
    });
  });

  describe('POST /users/me/onboarding', () => {
    it('ghi số dư vào VÍ và thu nhập vào USER trong cùng một transaction', async () => {
      const user = await registerUser(server);
      const res = await request(server as never)
        .post(`${API}/users/me/onboarding`)
        .set(user.auth)
        .send({ initialBalance: 12_000_000, monthlyIncome: 20_000_000 })
        .expect(201);

      expect(res.body.data.wallet.initialBalance).toBe(12_000_000);
      expect(res.body.data.wallet.startedAt).not.toBeNull();
      expect(res.body.data.monthlyIncome).toBe(20_000_000);
      expect(res.body.data.onboardedAt).not.toBeNull();
    });

    it('chỉ chạy được MỘT LẦN → lần hai 409', async () => {
      const user = await registerUser(server);
      await request(server as never)
        .post(`${API}/users/me/onboarding`)
        .set(user.auth)
        .send({ initialBalance: 5_000_000 })
        .expect(201);

      // Cho chạy lại sẽ reset startedAt và dịch chuyển toàn bộ lịch sử số dư
      await request(server as never)
        .post(`${API}/users/me/onboarding`)
        .set(user.auth)
        .send({ initialBalance: 999 })
        .expect(409);
    });

    it('số dư âm → 400', async () => {
      const user = await registerUser(server);
      await request(server as never)
        .post(`${API}/users/me/onboarding`)
        .set(user.auth)
        .send({ initialBalance: -1 })
        .expect(400);
    });
  });

  describe('PATCH /users/me', () => {
    it('sửa được name / monthStartDay', async () => {
      const user = await registerUser(server);
      const res = await request(server as never)
        .patch(`${API}/users/me`)
        .set(user.auth)
        .send({ name: 'Tên mới', monthStartDay: 25 })
        .expect(200);

      expect(res.body.data.name).toBe('Tên mới');
      expect(res.body.data.monthStartDay).toBe(25);
    });

    it('KHÔNG cho đổi email / onboardedAt (mass assignment)', async () => {
      const user = await registerUser(server);
      const res = await request(server as never)
        .patch(`${API}/users/me`)
        .set(user.auth)
        .send({
          name: 'Ổn',
          email: 'hacker@evil.com',
          passwordHash: 'xxx',
          onboardedAt: '2020-01-01T00:00:00.000Z',
        })
        .expect(200);

      expect(res.body.data.email).toBe(user.email);
      expect(res.body.data.onboardedAt).toBeNull();
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('monthStartDay = 31 → 400 (tháng 2 không có ngày đó)', async () => {
      const user = await registerUser(server);
      await request(server as never)
        .patch(`${API}/users/me`)
        .set(user.auth)
        .send({ monthStartDay: 31 })
        .expect(400);
    });

    it('body rỗng → 400', async () => {
      const user = await registerUser(server);
      await request(server as never)
        .patch(`${API}/users/me`)
        .set(user.auth)
        .send({})
        .expect(400);
    });
  });

  describe('PATCH /users/me/password', () => {
    it('đổi mật khẩu thu hồi TOÀN BỘ refresh token đang có', async () => {
      const user = await registerUser(server);

      await request(server as never)
        .patch(`${API}/users/me/password`)
        .set(user.auth)
        .send({ currentPassword: user.password, newPassword: 'matkhaumoi456' })
        .expect(204);

      // Phiên cũ phải chết — nếu không, kẻ đã chiếm tài khoản vẫn giữ được quyền truy cập
      await request(server as never)
        .post(`${API}/auth/refresh`)
        .set('Cookie', user.refreshCookie)
        .expect(401);

      await request(server as never)
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: 'matkhaumoi456' })
        .expect(200);

      await request(server as never)
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: user.password })
        .expect(401);
    });

    it('sai mật khẩu hiện tại → 401', async () => {
      const user = await registerUser(server);
      await request(server as never)
        .patch(`${API}/users/me/password`)
        .set(user.auth)
        .send({ currentPassword: 'saibet123', newPassword: 'matkhaumoi456' })
        .expect(401);
    });
  });

  describe('PATCH /wallet', () => {
    it.each([
      ['số dư âm', { initialBalance: -1 }],
      ['số dư có phần thập phân', { initialBalance: 100.5 }],
      ['body rỗng', {}],
    ])('%s → 400', async (_ten, body) => {
      const user = await registerUser(server);
      await request(server as never)
        .patch(`${API}/wallet`)
        .set(user.auth)
        .send(body)
        .expect(400);
    });
  });

  describe('Cách ly giữa các user', () => {
    it('user B không thấy dữ liệu của user A', async () => {
      const a = await registerUser(server);
      const b = await registerUser(server);

      await request(server as never)
        .patch(`${API}/wallet`)
        .set(a.auth)
        .send({ initialBalance: 99_000_000 })
        .expect(200);

      const viB = await request(server as never)
        .get(`${API}/wallet`)
        .set(b.auth)
        .expect(200);

      expect(viB.body.data.initialBalance).toBe(0);
    });
  });
});
