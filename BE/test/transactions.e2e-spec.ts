import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TestUser, registerOnboardedUser } from './utils/auth-helper';
import { createTestApp, truncateAll } from './utils/test-app';

const API = '/api/v1';

describe('Transactions (e2e)', () => {
  let app: INestApplication;
  let server: unknown;
  let dataSource: DataSource;
  let user: TestUser;
  let catChi: string;
  let catThu: string;

  beforeAll(async () => {
    ({ app, server, dataSource } = await createTestApp());
  });

  beforeEach(async () => {
    // 12tr số dư ban đầu
    user = await registerOnboardedUser(server, 12_000_000, 20_000_000);

    const cats = await request(server as never)
      .get(`${API}/categories`)
      .set(user.auth)
      .expect(200);

    catChi = cats.body.data.find((c: { name: string }) => c.name === 'Ăn vặt & cà phê').id;
    catThu = cats.body.data.find((c: { name: string }) => c.name === 'Thưởng').id;
  });

  afterAll(async () => {
    await truncateAll(dataSource);
    await app.close();
  });

  const taoTx = (over: Record<string, unknown> = {}) =>
    request(server as never)
      .post(`${API}/transactions`)
      .set(user.auth)
      .send({
        type: 'expense',
        amount: 50_000,
        categoryId: catChi,
        date: new Date().toISOString(),
        ...over,
      });

  describe('POST /transactions', () => {
    it('ghi khoản CHI → số dư giảm', async () => {
      await taoTx({ amount: 150_000 }).expect(201);
      const bal = await request(server as never)
        .get(`${API}/transactions`)
        .set(user.auth);
      expect(bal.body.data.items).toHaveLength(1);
      expect(bal.body.data.items[0].amount).toBe(150_000);
    });

    it('ghi khoản THU (lương/thưởng/được tặng) → số dư tăng', async () => {
      const res = await taoTx({
        type: 'income',
        amount: 5_000_000,
        categoryId: catThu,
      }).expect(201);

      expect(res.body.data.type).toBe('income');
      expect(res.body.data.amount).toBe(5_000_000);
      expect(res.body.data.category.name).toBe('Thưởng');
    });

    it('amount trả về là number, không phải string (MoneyTransformer)', async () => {
      const res = await taoTx({ amount: 65_000 }).expect(201);
      expect(typeof res.body.data.amount).toBe('number');
    });

    it('KHÔNG lộ walletId / userId ra API', async () => {
      const res = await taoTx().expect(201);
      const json = JSON.stringify(res.body);
      expect(json).not.toContain('walletId');
      expect(json).not.toContain('userId');
    });

    it('walletId do BE tự điền — user không phải chọn ví', async () => {
      const res = await taoTx().expect(201);
      const [row] = await dataSource.query(
        'SELECT t."walletId", w.id AS "viCuaUser" FROM transactions t JOIN wallets w ON w."userId" = t."userId" WHERE t.id = $1',
        [res.body.data.id],
      );
      expect(row.walletId).toBe(row.viCuaUser);
    });

    it('type CHI nhưng chọn danh mục THU → 400', async () => {
      // Nếu cho qua, một khoản chi sẽ được cộng vào số dư
      await taoTx({ type: 'expense', categoryId: catThu }).expect(400);
    });

    it('không cho ghi thẳng vào danh mục hệ thống → 400', async () => {
      const [sys] = await dataSource.query(
        `SELECT id FROM categories WHERE "userId" = $1 AND "isSystem" AND type = 'expense'`,
        [user.id],
      );
      await taoTx({ categoryId: sys.id }).expect(400);
    });

    it('danh mục của user khác → 404', async () => {
      const nguoiKhac = await registerOnboardedUser(server);
      const cats = await request(server as never)
        .get(`${API}/categories`)
        .set(nguoiKhac.auth);
      await taoTx({ categoryId: cats.body.data[0].id }).expect(404);
    });

    it.each([
      ['số tiền = 0', { amount: 0 }],
      ['số tiền âm', { amount: -50_000 }],
      ['số tiền thập phân', { amount: 50_000.5 }],
      ['thiếu categoryId', { categoryId: undefined }],
      ['type không hợp lệ', { type: 'chuyen-khoan' }],
    ])('%s → 400', async (_ten, over) => {
      await taoTx(over).expect(400);
    });
  });

  describe('GET /transactions — lọc & phân trang', () => {
    beforeEach(async () => {
      await taoTx({ amount: 30_000, date: '2026-08-01T10:00:00.000Z', tags: ['sang'] });
      await taoTx({ amount: 60_000, date: '2026-08-05T10:00:00.000Z', note: 'Cà phê với team' });
      await taoTx({ amount: 90_000, date: '2026-08-10T10:00:00.000Z' });
      await taoTx({
        type: 'income',
        amount: 5_000_000,
        categoryId: catThu,
        date: '2026-08-03T10:00:00.000Z',
      });
    });

    it('sắp xếp mới nhất trước', async () => {
      const res = await request(server as never)
        .get(`${API}/transactions`)
        .set(user.auth)
        .expect(200);

      const ngay = res.body.data.items.map((t: { date: string }) => t.date);
      expect(ngay).toEqual([...ngay].sort().reverse());
    });

    it.each([
      ['type=expense', 'type=expense', 3],
      ['type=income', 'type=income', 1],
      ['khoảng ngày', 'from=2026-08-04T00:00:00.000Z&to=2026-08-11T00:00:00.000Z', 2],
      ['khoảng số tiền', 'minAmount=50000&maxAmount=100000', 2],
      ['theo tag', 'tags=sang', 1],
      ['tìm trong ghi chú', 'q=team', 1],
    ])('lọc %s → %s kết quả', async (_ten, qs, soLuong) => {
      const res = await request(server as never)
        .get(`${API}/transactions?${qs}`)
        .set(user.auth)
        .expect(200);
      expect(res.body.data.items).toHaveLength(soLuong);
    });

    it('phân trang cursor: không lặp, không sót bản ghi', async () => {
      const trang1 = await request(server as never)
        .get(`${API}/transactions?limit=2`)
        .set(user.auth)
        .expect(200);

      expect(trang1.body.data.items).toHaveLength(2);
      expect(trang1.body.data.nextCursor).toEqual(expect.any(String));

      const trang2 = await request(server as never)
        .get(`${API}/transactions?limit=2&cursor=${trang1.body.data.nextCursor}`)
        .set(user.auth)
        .expect(200);

      expect(trang2.body.data.items).toHaveLength(2);
      expect(trang2.body.data.nextCursor).toBeNull();

      const ids = [...trang1.body.data.items, ...trang2.body.data.items].map(
        (t: { id: string }) => t.id,
      );
      expect(new Set(ids).size).toBe(4);
    });

    it('cursor rác → 400', async () => {
      await request(server as never)
        .get(`${API}/transactions?cursor=rac-khong-decode-duoc`)
        .set(user.auth)
        .expect(400);
    });

    it('chỉ thấy giao dịch của chính mình', async () => {
      const nguoiKhac = await registerOnboardedUser(server);
      const res = await request(server as never)
        .get(`${API}/transactions`)
        .set(nguoiKhac.auth)
        .expect(200);
      expect(res.body.data.items).toHaveLength(0);
    });
  });

  describe('PATCH / DELETE /transactions/:id', () => {
    it('sửa được số tiền và ghi chú', async () => {
      const tx = (await taoTx().expect(201)).body.data;
      const res = await request(server as never)
        .patch(`${API}/transactions/${tx.id}`)
        .set(user.auth)
        .send({ amount: 75_000, note: 'Sửa lại' })
        .expect(200);

      expect(res.body.data.amount).toBe(75_000);
      expect(res.body.data.note).toBe('Sửa lại');
    });

    it('KHÔNG cho đổi type → 400', async () => {
      const tx = (await taoTx().expect(201)).body.data;
      await request(server as never)
        .patch(`${API}/transactions/${tx.id}`)
        .set(user.auth)
        .send({ type: 'income' })
        .expect(400);
    });

    it('đổi sang danh mục lệch chiều tiền → 400', async () => {
      const tx = (await taoTx().expect(201)).body.data;
      await request(server as never)
        .patch(`${API}/transactions/${tx.id}`)
        .set(user.auth)
        .send({ categoryId: catThu })
        .expect(400);
    });

    it('xóa → 204 và biến mất khỏi danh sách', async () => {
      const tx = (await taoTx().expect(201)).body.data;
      await request(server as never)
        .delete(`${API}/transactions/${tx.id}`)
        .set(user.auth)
        .expect(204);

      await request(server as never)
        .get(`${API}/transactions/${tx.id}`)
        .set(user.auth)
        .expect(404);
    });

    it('không sửa/xóa được giao dịch của user khác → 404', async () => {
      const tx = (await taoTx().expect(201)).body.data;
      const nguoiKhac = await registerOnboardedUser(server);

      await request(server as never)
        .patch(`${API}/transactions/${tx.id}`)
        .set(nguoiKhac.auth)
        .send({ amount: 1 })
        .expect(404);

      await request(server as never)
        .delete(`${API}/transactions/${tx.id}`)
        .set(nguoiKhac.auth)
        .expect(404);

      const [row] = await dataSource.query(
        'SELECT amount FROM transactions WHERE id = $1',
        [tx.id],
      );
      expect(Number(row.amount)).toBe(50_000);
    });
  });

  describe('POST /transactions/adjust-balance', () => {
    it('app tính THIẾU → tạo giao dịch THU bù đúng phần chênh', async () => {
      await taoTx({ amount: 2_000_000 }).expect(201); // còn 10tr

      const res = await request(server as never)
        .post(`${API}/transactions/adjust-balance`)
        .set(user.auth)
        .send({ actualBalance: 11_000_000 })
        .expect(201);

      expect(res.body.data.calculatedBalance).toBe(10_000_000);
      expect(res.body.data.difference).toBe(1_000_000);
      expect(res.body.data.transaction.type).toBe('income');
      expect(res.body.data.transaction.amount).toBe(1_000_000);
    });

    it('app tính THỪA → tạo giao dịch CHI bù', async () => {
      const res = await request(server as never)
        .post(`${API}/transactions/adjust-balance`)
        .set(user.auth)
        .send({ actualBalance: 9_000_000 })
        .expect(201);

      expect(res.body.data.difference).toBe(-3_000_000);
      expect(res.body.data.transaction.type).toBe('expense');
      expect(res.body.data.transaction.amount).toBe(3_000_000);
    });

    it('không lệch → không tạo giao dịch rác', async () => {
      const res = await request(server as never)
        .post(`${API}/transactions/adjust-balance`)
        .set(user.auth)
        .send({ actualBalance: 12_000_000 })
        .expect(201);

      expect(res.body.data.difference).toBe(0);
      expect(res.body.data.transaction).toBeNull();
    });

    it('sau khi điều chỉnh, số dư khớp đúng số user khai', async () => {
      await taoTx({ amount: 500_000 }).expect(201);
      await request(server as never)
        .post(`${API}/transactions/adjust-balance`)
        .set(user.auth)
        .send({ actualBalance: 8_000_000 })
        .expect(201);

      const lai = await request(server as never)
        .post(`${API}/transactions/adjust-balance`)
        .set(user.auth)
        .send({ actualBalance: 8_000_000 })
        .expect(201);

      expect(lai.body.data.calculatedBalance).toBe(8_000_000);
      expect(lai.body.data.difference).toBe(0);
    });

    it('giao dịch bù dùng danh mục HỆ THỐNG (để loại khỏi thống kê và AI)', async () => {
      const res = await request(server as never)
        .post(`${API}/transactions/adjust-balance`)
        .set(user.auth)
        .send({ actualBalance: 15_000_000 })
        .expect(201);

      const [row] = await dataSource.query(
        `SELECT c."isSystem", c.name FROM transactions t
         JOIN categories c ON c.id = t."categoryId" WHERE t.id = $1`,
        [res.body.data.transaction.id],
      );
      expect(row.isSystem).toBe(true);
      expect(row.name).toBe('Điều chỉnh số dư');
    });
  });

  describe('Cache thống kê', () => {
    it('mọi thay đổi giao dịch đều xóa cache', async () => {
      const redis = (await import('ioredis')).default;
      const client = new redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
      });
      const key = `stats:${user.id}:summary`;

      for (const hanhDong of ['create', 'update', 'delete'] as const) {
        await client.set(key, '{"cu":1}', 'EX', 300);
        const tx = (await taoTx().expect(201)).body.data;

        if (hanhDong === 'update') {
          await client.set(key, '{"cu":1}', 'EX', 300);
          await request(server as never)
            .patch(`${API}/transactions/${tx.id}`)
            .set(user.auth)
            .send({ amount: 99_000 })
            .expect(200);
        } else if (hanhDong === 'delete') {
          await client.set(key, '{"cu":1}', 'EX', 300);
          await request(server as never)
            .delete(`${API}/transactions/${tx.id}`)
            .set(user.auth)
            .expect(204);
        }

        expect(await client.exists(key)).toBe(0);
      }

      client.disconnect();
    });
  });
});
