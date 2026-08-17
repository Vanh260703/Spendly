import request from 'supertest';
import { uniqueEmail } from './test-app';

export interface TestUser {
  email: string;
  password: string;
  id: string;
  accessToken: string;
  /** Header sẵn sàng gắn vào request: `.set(...user.auth)` */
  auth: { Authorization: string };
  /** Cookie refresh token thô, để test refresh/logout */
  refreshCookie: string;
}

const MAT_KHAU = 'matkhau123';

/** Đăng ký một user mới và trả về mọi thứ cần để gọi API tiếp theo. */
export async function registerUser(
  server: unknown,
  email = uniqueEmail(),
): Promise<TestUser> {
  const res = await request(server as never)
    .post('/api/v1/auth/register')
    .send({ email, password: MAT_KHAU, name: 'Người dùng test' })
    .expect(201);

  const cookies = res.headers['set-cookie'] as unknown as string[];

  return {
    email,
    password: MAT_KHAU,
    id: res.body.data.user.id,
    accessToken: res.body.data.accessToken,
    auth: { Authorization: `Bearer ${res.body.data.accessToken}` },
    refreshCookie: cookies?.find((c) => c.startsWith('spendly_rt=')) ?? '',
  };
}

/** Đăng ký + hoàn tất onboarding, dùng cho test cần ví đã có số dư */
export async function registerOnboardedUser(
  server: unknown,
  initialBalance = 12_000_000,
  monthlyIncome = 20_000_000,
): Promise<TestUser> {
  const user = await registerUser(server);
  await request(server as never)
    .post('/api/v1/users/me/onboarding')
    .set(user.auth)
    .send({ initialBalance, monthlyIncome })
    .expect(201);
  return user;
}
