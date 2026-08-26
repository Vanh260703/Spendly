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
  /** Có sau `registerOnboardedUser` — dùng để giả lập webhook SePay */
  accountNumber?: string;
  bankAccountId?: string;
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

/**
 * Đăng ký + liên kết một tài khoản ngân hàng.
 *
 * `accountNumber` phải DUY NHẤT toàn cục (một số tài khoản chỉ thuộc một người), nên sinh
 * ngẫu nhiên — dùng số cố định thì test thứ hai trở đi sẽ đụng 409.
 */
export async function registerOnboardedUser(
  server: unknown,
  accountNumber = `TK${Date.now()}${Math.floor(Math.random() * 100000)}`,
): Promise<TestUser> {
  const user = await registerUser(server);
  const res = await request(server as never)
    .post('/api/v1/users/me/onboarding')
    .set(user.auth)
    .send({ accountNumber, bankName: 'MBBank', nickname: 'Tài khoản test' })
    .expect(201);
  user.accountNumber = accountNumber;
  user.bankAccountId = res.body.data.bankAccount.id;
  return user;
}

/**
 * Giả lập SePay đẩy một biến động số dư về.
 *
 * Đây là cách DUY NHẤT tạo giao dịch trong app mới — `POST /transactions` đã bị gỡ vì
 * ngân hàng là nguồn sự thật. Test đi qua đúng đường mà đời thật đi.
 */
export async function guiWebhookSePay(
  server: unknown,
  args: {
    accountNumber: string;
    amount: number;
    /** 'in' = tiền vào · 'out' = tiền ra */
    transferType?: 'in' | 'out';
    /** Số dư sau giao dịch — chính là số app hiển thị */
    accumulated?: number;
    date?: string;
    content?: string;
    /** `id` phía SePay — khóa chống trùng. Trùng nhau là cố ý test gọi lại. */
    sepayId?: number;
  },
): Promise<void> {
  await request(server as never)
    .post('/api/v1/webhooks/sepay')
    .send({
      id: args.sepayId ?? Math.floor(Math.random() * 1_000_000_000),
      gateway: 'MBBank',
      transactionDate: args.date ?? '2026-08-20 10:00:00',
      accountNumber: args.accountNumber,
      subAccount: null,
      code: null,
      content: args.content ?? 'Giao dich test',
      description: args.content ?? 'Giao dich test',
      transferType: args.transferType ?? 'out',
      transferAmount: args.amount,
      referenceCode: `FT${Math.floor(Math.random() * 1_000_000)}`,
      accumulated: args.accumulated ?? 0,
    })
    .expect(201);
}
