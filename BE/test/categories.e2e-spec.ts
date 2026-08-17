import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TestUser, registerUser } from './utils/auth-helper';
import { createTestApp, truncateAll } from './utils/test-app';

const API = '/api/v1';

const catMoi = (over: Record<string, unknown> = {}) => ({
  name: 'Trà sữa',
  type: 'expense',
  kind: 'want',
  icon: 'cup-soda',
  color: '#f472b6',
  ...over,
});

describe('Categories (e2e)', () => {
  let app: INestApplication;
  let server: unknown;
  let dataSource: DataSource;
  let user: TestUser;

  beforeAll(async () => {
    ({ app, server, dataSource } = await createTestApp());
  });

  beforeEach(async () => {
    user = await registerUser(server);
  });

  afterAll(async () => {
    await truncateAll(dataSource);
    await app.close();
  });

  const taoCat = async (over = {}) =>
    (
      await request(server as never)
        .post(`${API}/categories`)
        .set(user.auth)
        .send(catMoi(over))
        .expect(201)
    ).body.data;

  describe('GET /categories', () => {
    it('trả 18 danh mục seed, ẩn 4 danh mục hệ thống', async () => {
      const res = await request(server as never)
        .get(`${API}/categories`)
        .set(user.auth)
        .expect(200);

      expect(res.body.data).toHaveLength(18);
      // Bút toán kỹ thuật, không phải danh mục để user chọn — cả hai đều phải bị ẩn
      expect(JSON.stringify(res.body)).not.toContain('Điều chỉnh số dư');
      expect(JSON.stringify(res.body)).not.toContain('Trả hộ bạn bè');
      expect(JSON.stringify(res.body)).not.toContain('isSystem');
    });

    it('có đủ danh mục THU để ghi lương/thưởng/được tặng', async () => {
      const res = await request(server as never)
        .get(`${API}/categories?type=income`)
        .set(user.auth)
        .expect(200);

      const ten = res.body.data.map((c: { name: string }) => c.name);
      expect(ten).toEqual(
        expect.arrayContaining(['Lương', 'Thưởng', 'Freelance', 'Đầu tư', 'Được tặng']),
      );
    });

    it('lọc theo kind=want (vùng AI được phép đề xuất cắt giảm)', async () => {
      const res = await request(server as never)
        .get(`${API}/categories?kind=want`)
        .set(user.auth)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((c: { kind: string }) => c.kind === 'want')).toBe(true);
    });
  });

  describe('POST /categories', () => {
    it('tạo được danh mục mới', async () => {
      const cat = await taoCat();
      expect(cat).toMatchObject({ name: 'Trà sữa', type: 'expense', kind: 'want' });
    });

    it('KHÔNG cho client tự set isDefault / isSystem / userId', async () => {
      const res = await request(server as never)
        .post(`${API}/categories`)
        .set(user.auth)
        .send(
          catMoi({
            isDefault: true,
            isSystem: true,
            userId: '22222222-2222-2222-2222-222222222222',
          }),
        )
        .expect(201);

      expect(res.body.data.isDefault).toBe(false);

      const [row] = await dataSource.query(
        'SELECT "isSystem", "userId" FROM categories WHERE id = $1',
        [res.body.data.id],
      );
      expect(row.isSystem).toBe(false);
      expect(row.userId).toBe(user.id);
    });

    it('màu không phải mã hex → 400', async () => {
      await request(server as never)
        .post(`${API}/categories`)
        .set(user.auth)
        .send(catMoi({ color: 'đỏ' }))
        .expect(400);
    });

    it('danh mục con phải cùng type với cha → 409 nếu khác', async () => {
      const cha = await taoCat({ name: 'Ăn uống 2' });
      await request(server as never)
        .post(`${API}/categories`)
        .set(user.auth)
        .send(catMoi({ name: 'Sai type', type: 'income', parentId: cha.id }))
        .expect(409);
    });

    it('parentId của user khác → 404 (không lộ sự tồn tại)', async () => {
      const cha = await taoCat();
      const nguoiKhac = await registerUser(server);

      await request(server as never)
        .post(`${API}/categories`)
        .set(nguoiKhac.auth)
        .send(catMoi({ name: 'Trộm', parentId: cha.id }))
        .expect(404);
    });
  });

  describe('PATCH /categories/:id', () => {
    it('đổi được tên', async () => {
      const cat = await taoCat();
      const res = await request(server as never)
        .patch(`${API}/categories/${cat.id}`)
        .set(user.auth)
        .send({ name: 'Trà sữa & nước ép' })
        .expect(200);

      expect(res.body.data.name).toBe('Trà sữa & nước ép');
    });

    it('KHÔNG cho đổi type → 400', async () => {
      // Đổi chi thành thu sẽ khiến mọi giao dịch cũ lệch chiều tiền,
      // số dư và toàn bộ báo cáo lịch sử sai theo
      const cat = await taoCat();
      await request(server as never)
        .patch(`${API}/categories/${cat.id}`)
        .set(user.auth)
        .send({ type: 'income' })
        .expect(400);
    });

    it('tự làm cha của chính nó → 409', async () => {
      const cat = await taoCat();
      await request(server as never)
        .patch(`${API}/categories/${cat.id}`)
        .set(user.auth)
        .send({ parentId: cat.id })
        .expect(409);
    });

    it('id không phải UUID → 400', async () => {
      await request(server as never)
        .patch(`${API}/categories/abc`)
        .set(user.auth)
        .send({ name: 'x' })
        .expect(400);
    });

    it('sửa danh mục của user khác → 404', async () => {
      const cat = await taoCat();
      const nguoiKhac = await registerUser(server);

      await request(server as never)
        .patch(`${API}/categories/${cat.id}`)
        .set(nguoiKhac.auth)
        .send({ name: 'bị hack' })
        .expect(404);

      const [row] = await dataSource.query('SELECT name FROM categories WHERE id = $1', [
        cat.id,
      ]);
      expect(row.name).toBe('Trà sữa');
    });
  });

  describe('DELETE /categories/:id', () => {
    it('XÓA DANH MỤC KHÔNG XÓA GIAO DỊCH — chuyển hết về "Khác"', async () => {
      const cat = await taoCat();
      const [wallet] = await dataSource.query(
        'SELECT id FROM wallets WHERE "userId" = $1',
        [user.id],
      );

      await dataSource.query(
        `INSERT INTO transactions ("userId","walletId","categoryId",type,amount,date,tags)
         VALUES ($1,$2,$3,'expense',45000,now(),'{}'), ($1,$2,$3,'expense',50000,now(),'{}')`,
        [user.id, wallet.id, cat.id],
      );

      const res = await request(server as never)
        .delete(`${API}/categories/${cat.id}`)
        .set(user.auth)
        .expect(200);

      expect(res.body.data.movedTransactions).toBe(2);

      // Mất danh mục thì chấp nhận được; mất lịch sử tiền thì không
      const [{ count }] = await dataSource.query(
        'SELECT count(*)::int FROM transactions WHERE "userId" = $1',
        [user.id],
      );
      expect(count).toBe(2);

      const ten = await dataSource.query(
        `SELECT DISTINCT c.name FROM transactions t
         JOIN categories c ON c.id = t."categoryId" WHERE t."userId" = $1`,
        [user.id],
      );
      expect(ten).toEqual([{ name: 'Khác' }]);
    });

    it('xóa danh mục cha → con được gỡ liên kết, KHÔNG bị xóa theo', async () => {
      const cha = await taoCat({ name: 'Cha' });
      const con = await taoCat({ name: 'Con', parentId: cha.id });

      await request(server as never)
        .delete(`${API}/categories/${cha.id}`)
        .set(user.auth)
        .expect(200);

      const [row] = await dataSource.query(
        'SELECT "parentId" FROM categories WHERE id = $1',
        [con.id],
      );
      expect(row).toBeDefined();
      expect(row.parentId).toBeNull();
    });

    it('xóa danh mục → ngân sách gắn kèm bị xóa theo (cascade)', async () => {
      const cat = await taoCat();
      await dataSource.query(
        `INSERT INTO budgets ("userId","categoryId",period,amount,"startDate")
         VALUES ($1,$2,'monthly',3000000,now())`,
        [user.id, cat.id],
      );

      await request(server as never)
        .delete(`${API}/categories/${cat.id}`)
        .set(user.auth)
        .expect(200);

      const [{ count }] = await dataSource.query(
        'SELECT count(*)::int FROM budgets WHERE "categoryId" = $1',
        [cat.id],
      );
      expect(count).toBe(0);
    });

    it('không cho xóa danh mục "Khác" (nơi hứng giao dịch) → 409', async () => {
      const [khac] = await dataSource.query(
        `SELECT id FROM categories WHERE "userId" = $1 AND "isDefault" AND type = 'expense'`,
        [user.id],
      );

      await request(server as never)
        .delete(`${API}/categories/${khac.id}`)
        .set(user.auth)
        .expect(409);
    });

    it('không cho xóa danh mục hệ thống → 409', async () => {
      const [sys] = await dataSource.query(
        `SELECT id FROM categories WHERE "userId" = $1 AND "isSystem" LIMIT 1`,
        [user.id],
      );

      await request(server as never)
        .delete(`${API}/categories/${sys.id}`)
        .set(user.auth)
        .expect(409);
    });

    it('UUID hợp lệ nhưng không tồn tại → 404', async () => {
      await request(server as never)
        .delete(`${API}/categories/99999999-9999-9999-9999-999999999999`)
        .set(user.auth)
        .expect(404);
    });
  });

  describe('Bảo vệ endpoint', () => {
    it.each([
      ['GET', '/categories'],
      ['POST', '/categories'],
    ])('%s %s không token → 401', async (method, path) => {
      await request(server as never)
        [method.toLowerCase() as 'get' | 'post'](`${API}${path}`)
        .send({})
        .expect(401);
    });
  });
});
