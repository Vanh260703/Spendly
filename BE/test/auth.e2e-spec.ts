import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, truncateAll, uniqueEmail } from './utils/test-app';
import { registerUser } from './utils/auth-helper';

const API = '/api/v1';

describe('Auth (e2e)', () => {
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

  describe('POST /auth/register', () => {
    it('tạo user + ví + danh mục mặc định trong một transaction', async () => {
      const email = uniqueEmail();
      const res = await request(server as never)
        .post(`${API}/auth/register`)
        .send({ email, password: 'matkhau123', name: 'Việt Anh' })
        .expect(201);

      expect(res.body).toEqual({
        success: true,
        data: {
          user: { id: expect.any(String), email, name: 'Việt Anh', onboardedAt: null },
          accessToken: expect.any(String),
        },
      });

      const userId = res.body.data.user.id;
      const [{ count: viCount }] = await dataSource.query(
        'SELECT count(*)::int FROM wallets WHERE "userId" = $1',
        [userId],
      );
      const [{ count: catCount }] = await dataSource.query(
        'SELECT count(*)::int FROM categories WHERE "userId" = $1',
        [userId],
      );
      expect(viCount).toBe(1);
      // 18 danh mục dùng được + 4 danh mục hệ thống (2 "Điều chỉnh số dư" + 2 "Trả hộ bạn bè")
      expect(catCount).toBe(22);
    });

    it('đặt refresh token vào httpOnly cookie, KHÔNG trả trong body', async () => {
      const res = await request(server as never)
        .post(`${API}/auth/register`)
        .send({ email: uniqueEmail(), password: 'matkhau123', name: 'X' })
        .expect(201);

      const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
      expect(cookie).toContain('spendly_rt=');
      expect(cookie).toContain('HttpOnly');
      expect(JSON.stringify(res.body)).not.toContain('refreshToken');
    });

    it('email trùng → 409 (kể cả khác hoa thường)', async () => {
      const email = uniqueEmail();
      await registerUser(server, email);

      await request(server as never)
        .post(`${API}/auth/register`)
        .send({ email: email.toUpperCase(), password: 'matkhau123', name: 'X' })
        .expect(409);
    });

    it('bỏ qua field client tự gửi thêm (chống mass assignment)', async () => {
      const res = await request(server as never)
        .post(`${API}/auth/register`)
        .send({
          email: uniqueEmail(),
          password: 'matkhau123',
          name: 'X',
          id: '11111111-1111-1111-1111-111111111111',
          onboardedAt: '2020-01-01T00:00:00.000Z',
          monthlyIncome: 999_999_999,
        })
        .expect(201);

      expect(res.body.data.user.id).not.toBe('11111111-1111-1111-1111-111111111111');
      expect(res.body.data.user.onboardedAt).toBeNull();

      const me = await request(server as never)
        .get(`${API}/users/me`)
        .set({ Authorization: `Bearer ${res.body.data.accessToken}` })
        .expect(200);
      expect(me.body.data.monthlyIncome).toBeNull();
    });

    it.each([
      ['email sai định dạng', { email: 'khong-phai-email', password: 'matkhau123', name: 'X' }],
      ['mật khẩu dưới 8 ký tự', { email: 'a@b.com', password: '123', name: 'X' }],
      ['mật khẩu quá 72 ký tự', { email: 'a@b.com', password: 'a'.repeat(73), name: 'X' }],
      ['tên chỉ có khoảng trắng', { email: 'a@b.com', password: 'matkhau123', name: '   ' }],
    ])('%s → 400', async (_ten, body) => {
      await request(server as never).post(`${API}/auth/register`).send(body).expect(400);
    });

    it('5 request đồng thời cùng email chỉ tạo được 1 user', async () => {
      const email = uniqueEmail();
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(server as never)
            .post(`${API}/auth/register`)
            .send({ email, password: 'matkhau123', name: 'X' }),
        ),
      );

      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);

      const [{ count }] = await dataSource.query(
        'SELECT count(*)::int FROM users WHERE email = $1',
        [email],
      );
      expect(count).toBe(1);
    });
  });

  describe('POST /auth/login', () => {
    it('đăng nhập đúng → 200 + access token', async () => {
      const user = await registerUser(server);
      const res = await request(server as never)
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: user.password })
        .expect(200);

      expect(res.body.data.accessToken).toEqual(expect.any(String));
    });

    it('email viết HOA vẫn đăng nhập được', async () => {
      const user = await registerUser(server);
      await request(server as never)
        .post(`${API}/auth/login`)
        .send({ email: user.email.toUpperCase(), password: user.password })
        .expect(200);
    });

    it('thông báo lỗi GIỐNG NHAU khi sai mật khẩu và khi email không tồn tại', async () => {
      const user = await registerUser(server);

      const saiMatKhau = await request(server as never)
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: 'saibet123' })
        .expect(401);

      const khongTonTai = await request(server as never)
        .post(`${API}/auth/login`)
        .send({ email: uniqueEmail(), password: 'saibet123' })
        .expect(401);

      // Khác nhau là kẻ tấn công dò được email nào đã đăng ký
      expect(saiMatKhau.body.message).toBe(khongTonTai.body.message);
    });
  });

  describe('POST /auth/refresh — xoay vòng token', () => {
    it('cấp token mới và THU HỒI token cũ (chống dùng lại)', async () => {
      const user = await registerUser(server);

      const lan1 = await request(server as never)
        .post(`${API}/auth/refresh`)
        .set('Cookie', user.refreshCookie)
        .expect(200);
      expect(lan1.body.data.accessToken).toEqual(expect.any(String));

      const cookieMoi = (lan1.headers['set-cookie'] as unknown as string[])[0];
      expect(cookieMoi).not.toBe(user.refreshCookie);

      // Token cũ phải chết ngay sau khi xoay vòng
      await request(server as never)
        .post(`${API}/auth/refresh`)
        .set('Cookie', user.refreshCookie)
        .expect(401);
    });

    it('không có cookie → 401', async () => {
      await request(server as never).post(`${API}/auth/refresh`).expect(401);
    });

    it('dùng ACCESS token làm refresh cookie → 401 (2 secret khác nhau)', async () => {
      const user = await registerUser(server);
      await request(server as never)
        .post(`${API}/auth/refresh`)
        .set('Cookie', `spendly_rt=${user.accessToken}`)
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('thu hồi refresh token → không refresh lại được', async () => {
      const user = await registerUser(server);

      await request(server as never)
        .post(`${API}/auth/logout`)
        .set('Cookie', user.refreshCookie)
        .expect(204);

      await request(server as never)
        .post(`${API}/auth/refresh`)
        .set('Cookie', user.refreshCookie)
        .expect(401);
    });

    it('không có cookie vẫn trả 204 (logout luôn thành công)', async () => {
      await request(server as never).post(`${API}/auth/logout`).expect(204);
    });
  });

  describe('GET /auth/me', () => {
    it('trả hồ sơ và KHÔNG BAO GIỜ lộ passwordHash', async () => {
      const user = await registerUser(server);
      const res = await request(server as never)
        .get(`${API}/auth/me`)
        .set(user.auth)
        .expect(200);

      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
      // Whitelist tường minh — thêm cột vào entity không được tự lọt ra API
      expect(Object.keys(res.body.data).sort()).toEqual([
        'avatarUrl',
        'email',
        'id',
        'monthStartDay',
        'monthlyIncome',
        'name',
        'onboardedAt',
        'timezone',
      ]);
    });

    it.each([
      ['không có token', undefined],
      ['token rác', 'Bearer rac.rac.rac'],
      ['sai định dạng header', 'khong-co-chu-Bearer'],
      ['Bearer rỗng', 'Bearer '],
    ])('%s → 401', async (_ten, header) => {
      const req = request(server as never).get(`${API}/auth/me`);
      if (header) req.set('Authorization', header);
      await req.expect(401);
    });

    it('dùng REFRESH token làm access token → 401', async () => {
      const user = await registerUser(server);
      const rt = user.refreshCookie.split('=')[1].split(';')[0];
      await request(server as never)
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${rt}`)
        .expect(401);
    });
  });
});
