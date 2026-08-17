import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TestUser, registerOnboardedUser } from './utils/auth-helper';
import { createTestApp, truncateAll } from './utils/test-app';

const API = '/api/v1';

describe('Stats (e2e)', () => {
  let app: INestApplication;
  let server: unknown;
  let dataSource: DataSource;
  let user: TestUser;
  let cat: Record<string, string>;

  beforeAll(async () => {
    ({ app, server, dataSource } = await createTestApp());
  });

  beforeEach(async () => {
    user = await registerOnboardedUser(server, 12_000_000, 20_000_000);
    const res = await request(server as never).get(`${API}/categories`).set(user.auth);
    cat = Object.fromEntries(
      res.body.data.map((c: { name: string; id: string }) => [c.name, c.id]),
    );
  });

  afterAll(async () => {
    await truncateAll(dataSource);
    await app.close();
  });

  const ghi = (over: Record<string, unknown>) =>
    request(server as never)
      .post(`${API}/transactions`)
      .set(user.auth)
      .send({
        type: 'expense',
        amount: 50_000,
        categoryId: cat['Ăn vặt & cà phê'],
        date: new Date().toISOString(),
        ...over,
      })
      .expect(201);

  describe('GET /stats/balance', () => {
    it('số dư = số dư ban đầu + thu − chi', async () => {
      await ghi({ type: 'income', amount: 5_000_000, categoryId: cat['Thưởng'] });
      await ghi({ amount: 200_000 });

      const res = await request(server as never)
        .get(`${API}/stats/balance`)
        .set(user.auth)
        .expect(200);

      expect(res.body.data).toMatchObject({
        initialBalance: 12_000_000,
        totalIncome: 5_000_000,
        totalExpense: 200_000,
        currentBalance: 16_800_000,
      });
      // Nếu ra string nghĩa là quên Number() cho SUM() của raw query
      expect(typeof res.body.data.currentBalance).toBe('number');
    });

    it('tiền cam kết cho mục tiêu KHÔNG trừ vào số dư, chỉ trừ vào "tự do tiêu"', async () => {
      await dataSource.query(
        `INSERT INTO goals ("userId",name,horizon,"targetAmount","currentAmount",status,icon,color)
         VALUES ($1,'Mua Macbook','short',35000000,4000000,'active','laptop','#0ea5e9')`,
        [user.id],
      );

      const res = await request(server as never)
        .get(`${API}/stats/balance`)
        .set(user.auth)
        .expect(200);

      // Tiền vẫn nằm trong ví — nạp mục tiêu là "gắn nhãn", không phải "chi"
      expect(res.body.data.currentBalance).toBe(12_000_000);
      expect(res.body.data.committedToGoals).toBe(4_000_000);
      expect(res.body.data.freeToSpend).toBe(8_000_000);
    });

    it('mục tiêu đã hoàn thành không còn tính vào cam kết', async () => {
      await dataSource.query(
        `INSERT INTO goals ("userId",name,horizon,"targetAmount","currentAmount",status,icon,color)
         VALUES ($1,'Xong rồi','short',1000000,1000000,'achieved','check','#000000')`,
        [user.id],
      );

      const res = await request(server as never)
        .get(`${API}/stats/balance`)
        .set(user.auth)
        .expect(200);

      expect(res.body.data.committedToGoals).toBe(0);
    });
  });

  describe('GET /stats/summary', () => {
    it('tổng thu/chi/chênh lệch + tỉ lệ need/want/saving', async () => {
      await ghi({ type: 'income', amount: 20_000_000, categoryId: cat['Thưởng'] });
      await ghi({ amount: 5_000_000, categoryId: cat['Nhà ở'] }); // need
      await ghi({ amount: 3_000_000, categoryId: cat['Mua sắm'] }); // want
      await ghi({ amount: 2_000_000, categoryId: cat['Trả nợ'] }); // saving

      const res = await request(server as never)
        .get(`${API}/stats/summary`)
        .set(user.auth)
        .expect(200);

      expect(res.body.data).toMatchObject({
        income: 20_000_000,
        expense: 10_000_000,
        net: 10_000_000,
        byKind: { need: 5_000_000, want: 3_000_000, saving: 2_000_000 },
        kindRatio: { need: 0.5, want: 0.3, saving: 0.2 },
      });
    });

    it('LOẠI giao dịch "điều chỉnh số dư" khỏi thống kê', async () => {
      await ghi({ amount: 100_000 });

      await request(server as never)
        .post(`${API}/transactions/adjust-balance`)
        .set(user.auth)
        .send({ actualBalance: 5_000_000 })
        .expect(201);

      const res = await request(server as never)
        .get(`${API}/stats/summary`)
        .set(user.auth)
        .expect(200);

      // Bút toán bù ~6,9tr không được tính thành khoản chi thật, nếu không AI sẽ
      // khuyên "cắt giảm" một thứ không tồn tại
      expect(res.body.data.expense).toBe(100_000);
    });

    it('không có dữ liệu → trả 0, không lỗi', async () => {
      const res = await request(server as never)
        .get(`${API}/stats/summary`)
        .set(user.auth)
        .expect(200);

      expect(res.body.data).toMatchObject({ income: 0, expense: 0, net: 0 });
      expect(res.body.data.comparison.changePercent).toBeNull();
    });
  });

  describe('GET /stats/by-category — dữ liệu cho AI', () => {
    it('trả CẢ tần suất, không chỉ tổng tiền', async () => {
      // Kịch bản cà phê: nhiều lần, mỗi lần ít
      for (let i = 0; i < 11; i++) await ghi({ amount: 50_000 });
      // Kịch bản mua sắm: một lần, số tiền lớn
      await ghi({ amount: 550_000, categoryId: cat['Mua sắm'] });

      const res = await request(server as never)
        .get(`${API}/stats/by-category`)
        .set(user.auth)
        .expect(200);

      const caPhe = res.body.data.find(
        (r: { category: { name: string } }) => r.category.name === 'Ăn vặt & cà phê',
      );
      const muaSam = res.body.data.find(
        (r: { category: { name: string } }) => r.category.name === 'Mua sắm',
      );

      // Cùng 550k nhưng hai vấn đề khác nhau — chỉ `count` mới phân biệt được
      expect(caPhe).toMatchObject({ total: 550_000, count: 11, average: 50_000 });
      expect(muaSam).toMatchObject({ total: 550_000, count: 1, average: 550_000 });
    });

    it('có kind để AI biết được phép đề xuất cắt ở đâu', async () => {
      await ghi({ amount: 100_000 });
      const res = await request(server as never)
        .get(`${API}/stats/by-category`)
        .set(user.auth)
        .expect(200);

      // AI chỉ được đề xuất cắt danh mục `want`
      expect(res.body.data[0].category.kind).toBe('want');
    });

    it('% trên tổng chi và % trên thu nhập', async () => {
      await ghi({ type: 'income', amount: 10_000_000, categoryId: cat['Thưởng'] });
      await ghi({ amount: 500_000 });
      await ghi({ amount: 1_500_000, categoryId: cat['Nhà ở'] });

      const res = await request(server as never)
        .get(`${API}/stats/by-category`)
        .set(user.auth)
        .expect(200);

      const caPhe = res.body.data.find(
        (r: { category: { name: string } }) => r.category.name === 'Ăn vặt & cà phê',
      );
      expect(caPhe.percentOfExpense).toBe(0.25); // 500k / 2tr
      expect(caPhe.percentOfIncome).toBe(0.05); // 500k / 10tr
    });

    it('chưa đủ dữ liệu kỳ trước → vsPrevious3Avg = null (không suy diễn)', async () => {
      await ghi({ amount: 100_000 });
      const res = await request(server as never)
        .get(`${API}/stats/by-category`)
        .set(user.auth)
        .expect(200);

      expect(res.body.data[0].vsPrevious3Avg).toBeNull();
    });

    it('sắp xếp giảm dần theo số tiền', async () => {
      await ghi({ amount: 100_000 });
      await ghi({ amount: 900_000, categoryId: cat['Nhà ở'] });
      await ghi({ amount: 500_000, categoryId: cat['Mua sắm'] });

      const res = await request(server as never)
        .get(`${API}/stats/by-category`)
        .set(user.auth)
        .expect(200);

      const tong = res.body.data.map((r: { total: number }) => r.total);
      expect(tong).toEqual([...tong].sort((a: number, b: number) => b - a));
    });

    it('type=income để xem cơ cấu thu nhập', async () => {
      await ghi({ type: 'income', amount: 20_000_000, categoryId: cat['Lương'] });
      await ghi({ type: 'income', amount: 5_000_000, categoryId: cat['Thưởng'] });

      const res = await request(server as never)
        .get(`${API}/stats/by-category?type=income`)
        .set(user.auth)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].category.name).toBe('Lương');
    });
  });

  describe('GET /stats/trend', () => {
    it('gom theo ngày', async () => {
      await ghi({ amount: 100_000, date: '2026-08-10T10:00:00.000Z' });
      await ghi({ amount: 200_000, date: '2026-08-10T15:00:00.000Z' });
      await ghi({ amount: 300_000, date: '2026-08-11T10:00:00.000Z' });

      const res = await request(server as never)
        .get(`${API}/stats/trend?from=2026-08-01T00:00:00.000Z&to=2026-08-31T23:59:59.999Z&groupBy=day`)
        .set(user.auth)
        .expect(200);

      const ngay10 = res.body.data.find((b: { bucket: string }) => b.bucket === '2026-08-10');
      expect(ngay10.expense).toBe(300_000);
    });

    it('tách riêng thu và chi trong cùng một bucket', async () => {
      await ghi({ amount: 100_000, date: '2026-08-10T10:00:00.000Z' });
      await ghi({
        type: 'income',
        amount: 5_000_000,
        categoryId: cat['Thưởng'],
        date: '2026-08-10T11:00:00.000Z',
      });

      const res = await request(server as never)
        .get(`${API}/stats/trend?from=2026-08-01T00:00:00.000Z&to=2026-08-31T23:59:59.999Z`)
        .set(user.auth)
        .expect(200);

      expect(res.body.data[0]).toMatchObject({ income: 5_000_000, expense: 100_000 });
    });
  });

  describe('GET /stats/calendar', () => {
    it('trả chi tiêu từng ngày + giá trị max để vẽ heatmap', async () => {
      await ghi({ amount: 235_000, date: '2026-08-12T10:00:00.000Z' });
      await ghi({ amount: 890_000, date: '2026-08-15T10:00:00.000Z' });

      const res = await request(server as never)
        .get(`${API}/stats/calendar?month=2026-08`)
        .set(user.auth)
        .expect(200);

      expect(res.body.data.max).toBe(890_000);
      expect(res.body.data.days).toEqual(
        expect.arrayContaining([{ date: '2026-08-12', expense: 235_000, count: 1 }]),
      );
    });
  });

  describe('Cách ly & cache', () => {
    it('chỉ tính dữ liệu của chính mình', async () => {
      await ghi({ amount: 999_000 });
      const nguoiKhac = await registerOnboardedUser(server, 1_000_000);

      const res = await request(server as never)
        .get(`${API}/stats/summary`)
        .set(nguoiKhac.auth)
        .expect(200);

      expect(res.body.data.expense).toBe(0);
    });

    it('thêm giao dịch mới → thống kê cập nhật ngay (cache bị xóa)', async () => {
      await ghi({ amount: 100_000 });

      const truoc = await request(server as never)
        .get(`${API}/stats/summary`)
        .set(user.auth)
        .expect(200);
      expect(truoc.body.data.expense).toBe(100_000);

      await ghi({ amount: 50_000 });

      // Nếu cache không bị xóa, số này vẫn là 100k và user thấy dữ liệu cũ
      const sau = await request(server as never)
        .get(`${API}/stats/summary`)
        .set(user.auth)
        .expect(200);
      expect(sau.body.data.expense).toBe(150_000);
    });
  });
});
