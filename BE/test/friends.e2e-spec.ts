import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TestUser, registerOnboardedUser } from './utils/auth-helper';
import { createTestApp, truncateAll } from './utils/test-app';

const API = '/api/v1';

describe('Danh bạ & công nợ bạn bè (e2e)', () => {
  let app: INestApplication;
  let server: unknown;
  let dataSource: DataSource;
  let user: TestUser;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    server = ctx.server;
    dataSource = ctx.dataSource;
  });

  afterAll(async () => {
    await truncateAll(dataSource);
    await app.close();
  });

  beforeEach(async () => {
    user = await registerOnboardedUser(server, 10_000_000);
  });

  // ————————————————————— Tiện ích —————————————————————

  const themNguoi = async (name: string): Promise<string> => {
    const res = await request(server as never)
      .post(`${API}/contacts`)
      .set(user.auth)
      .send({ name })
      .expect(201);
    return res.body.data.id;
  };

  const layDanhMuc = async (name: string, type = 'expense'): Promise<string> => {
    const res = await request(server as never)
      .get(`${API}/categories`)
      .set(user.auth)
      .expect(200);
    const c = res.body.data.find(
      (x: { name: string; type: string }) => x.name === name && x.type === type,
    );
    if (!c) throw new Error(`Không tìm thấy danh mục "${name}"`);
    return c.id;
  };

  const soDu = async () => {
    const res = await request(server as never)
      .get(`${API}/stats/balance`)
      .set(user.auth)
      .expect(200);
    return res.body.data;
  };

  const congNo = async (contactId: string): Promise<number> => {
    const res = await request(server as never)
      .get(`${API}/contacts`)
      .set(user.auth)
      .expect(200);
    return res.body.data.find((c: { id: string }) => c.id === contactId).balance;
  };

  // ————————————————————— Danh bạ —————————————————————

  describe('Danh bạ', () => {
    it('gõ tên là tạo được ngay, không cần bước nào khác', async () => {
      const res = await request(server as never)
        .post(`${API}/contacts`)
        .set(user.auth)
        .send({ name: 'Anh Tuấn' })
        .expect(201);

      expect(res.body.data.name).toBe('Anh Tuấn');
      expect(res.body.data.balance).toBe(0);
      expect(res.body.data.color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    /**
     * Ô chọn người trong form chia bill dựa hẳn vào hành vi này: gõ tên đã có thì phải nhận
     * lại đúng người đó, KHÔNG phải lỗi 409. Bắt user xử lý lỗi trùng giữa lúc đang ghi một
     * bữa ăn là cách nhanh nhất khiến họ bỏ không ghi nữa.
     */
    it('gõ lại tên đã có → trả về CHÍNH người đó, không báo trùng', async () => {
      const id = await themNguoi('Tuấn');

      const res = await request(server as never)
        .post(`${API}/contacts`)
        .set(user.auth)
        .send({ name: '  tuấn  ' }) // thừa khoảng trắng + khác hoa thường
        .expect(201);

      expect(res.body.data.id).toBe(id);

      const ds = await request(server as never).get(`${API}/contacts`).set(user.auth);
      expect(ds.body.data).toHaveLength(1);
    });

    /**
     * Hồi quy cho một quyết định thiết kế: "Tuấn" và "Tuan" có thể là HAI người thật.
     * Tự động gộp thì công nợ hai người dồn làm một và rất khó lần ra đã sai từ đâu.
     */
    it('KHÔNG gộp tên có dấu với không dấu', async () => {
      await themNguoi('Tuấn');
      await themNguoi('Tuan');

      const ds = await request(server as never).get(`${API}/contacts`).set(user.auth);
      expect(ds.body.data).toHaveLength(2);
    });

    it('đổi tên trùng người khác → 409', async () => {
      await themNguoi('Tuấn');
      const idLinh = await themNguoi('Linh');

      await request(server as never)
        .patch(`${API}/contacts/${idLinh}`)
        .set(user.auth)
        .send({ name: 'Tuấn' })
        .expect(409);
    });

    it('chỉ thấy danh bạ của chính mình', async () => {
      await themNguoi('Tuấn');
      const nguoiKhac = await registerOnboardedUser(server);

      const res = await request(server as never)
        .get(`${API}/contacts`)
        .set(nguoiKhac.auth)
        .expect(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  // ————————————————————— Chia bill: bạn trả hộ —————————————————————

  describe('Bạn trả hộ → sinh giao dịch ngay', () => {
    it('tách 3 giao dịch: thực ăn · mời · cho mượn', async () => {
      const [a, b, c] = await Promise.all([themNguoi('A'), themNguoi('B'), themNguoi('C')]);
      const anUong = await layDanhMuc('Ăn uống');
      const moi = await layDanhMuc('Mời bạn bè');

      await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          payerContactId: null,
          totalAmount: 1_000_000,
          date: '2026-08-16',
          note: 'Ăn tối sinh nhật',
          categoryId: anUong,
          treatAmount: 250_000,
          treatCategoryId: moi,
          shares: [
            { contactId: null, amount: 500_002 },
            { contactId: a, amount: 166_666 },
            { contactId: b, amount: 166_666 },
            { contactId: c, amount: 166_666 },
          ],
        })
        .expect(201);

      const tx = await request(server as never)
        .get(`${API}/transactions?limit=20`)
        .set(user.auth)
        .expect(200);

      const tien = (tx.body.data.items as { amount: number }[]).map((t) => t.amount).sort();
      expect(tien).toEqual([250_002, 250_000, 499_998].sort());
    });

    it('ví giảm ĐÚNG bằng tổng hóa đơn, không hơn không kém', async () => {
      const truoc = (await soDu()).currentBalance;
      const a = await themNguoi('A');
      const anUong = await layDanhMuc('Ăn uống');

      await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          totalAmount: 400_000,
          date: '2026-08-16',
          categoryId: anUong,
          shares: [
            { contactId: null, amount: 200_000 },
            { contactId: a, amount: 200_000 },
          ],
        })
        .expect(201);

      expect((await soDu()).currentBalance).toBe(truoc - 400_000);
    });

    /**
     * Lý do tồn tại của cả thiết kế tách giao dịch: phần CHO MƯỢN không được tính là bạn
     * tiêu, nếu không AI sẽ mắng bạn ăn uống hoang phí bằng tiền của người khác.
     */
    it('thống kê CHỈ tính phần bạn tiêu, không tính phần cho mượn', async () => {
      const a = await themNguoi('A');
      const anUong = await layDanhMuc('Ăn uống');

      await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          totalAmount: 1_000_000,
          date: new Date().toISOString().slice(0, 10),
          categoryId: anUong,
          shares: [
            { contactId: null, amount: 250_000 },
            { contactId: a, amount: 750_000 },
          ],
        })
        .expect(201);

      const res = await request(server as never)
        .get(`${API}/stats/by-category?period=month&type=expense`)
        .set(user.auth)
        .expect(200);

      const tong = (res.body.data as { total: number }[]).reduce((t, c) => t + c.total, 0);
      expect(tong).toBe(250_000); // KHÔNG phải 1.000.000
    });

    it('phần mời nằm ở danh mục RIÊNG, không lẫn vào Ăn uống', async () => {
      const a = await themNguoi('A');
      const anUong = await layDanhMuc('Ăn uống');
      const moi = await layDanhMuc('Mời bạn bè');

      await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          totalAmount: 600_000,
          date: new Date().toISOString().slice(0, 10),
          categoryId: anUong,
          treatAmount: 200_000,
          treatCategoryId: moi,
          shares: [
            { contactId: null, amount: 400_000 },
            { contactId: a, amount: 200_000 },
          ],
        })
        .expect(201);

      const res = await request(server as never)
        .get(`${API}/stats/by-category?period=month&type=expense`)
        .set(user.auth);

      const theoTen = Object.fromEntries(
        (res.body.data as { category: { name: string }; total: number }[]).map((c) => [
          c.category.name,
          c.total,
        ]),
      );
      expect(theoTen['Ăn uống']).toBe(200_000);
      expect(theoTen['Mời bạn bè']).toBe(200_000);
    });

    it('không ăn miếng nào (phần bạn = 0) → không tạo giao dịch 0₫', async () => {
      const a = await themNguoi('A');
      const anUong = await layDanhMuc('Ăn uống');

      await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          totalAmount: 300_000,
          date: '2026-08-16',
          categoryId: anUong,
          shares: [{ contactId: a, amount: 300_000 }],
        })
        .expect(201);

      const tx = await request(server as never)
        .get(`${API}/transactions?limit=20`)
        .set(user.auth);
      expect(tx.body.data.items).toHaveLength(1);
      expect(tx.body.data.items[0].amount).toBe(300_000);
    });
  });

  // ————————————————————— Chia bill: người khác trả hộ —————————————————————

  /**
   * Chiều này là chỗ dễ mô hình sai nhất: tiền CHƯA rời ví bạn, nên ghi giao dịch chi ngay
   * lúc đó sẽ làm số dư tính ra thấp hơn tiền thật.
   */
  describe('Người khác trả hộ bạn → KHÔNG sinh giao dịch nào', () => {
    it('ví không đổi, không có giao dịch nào được tạo', async () => {
      const truoc = (await soDu()).currentBalance;
      const tuan = await themNguoi('Tuấn');
      const anUong = await layDanhMuc('Ăn uống');

      await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          payerContactId: tuan,
          totalAmount: 400_000,
          date: '2026-08-16',
          categoryId: anUong,
          shares: [
            { contactId: null, amount: 100_000 },
            { contactId: tuan, amount: 300_000 },
          ],
        })
        .expect(201);

      expect((await soDu()).currentBalance).toBe(truoc);

      const tx = await request(server as never)
        .get(`${API}/transactions?limit=20`)
        .set(user.auth);
      expect(tx.body.data.items).toHaveLength(0);

      // Nhưng công nợ phải ghi nhận: bạn nợ Tuấn 100.000₫
      expect(await congNo(tuan)).toBe(-100_000);
    });

    it('người khác trả mà khai "tôi mời" → 400', async () => {
      const tuan = await themNguoi('Tuấn');
      const anUong = await layDanhMuc('Ăn uống');
      const moi = await layDanhMuc('Mời bạn bè');

      await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          payerContactId: tuan,
          totalAmount: 400_000,
          date: '2026-08-16',
          categoryId: anUong,
          treatAmount: 50_000,
          treatCategoryId: moi,
          shares: [
            { contactId: null, amount: 100_000 },
            { contactId: tuan, amount: 300_000 },
          ],
        })
        .expect(400);
    });
  });

  // ————————————————————— Bất biến tổng các phần —————————————————————

  describe('Bất biến Σ shares = totalAmount', () => {
    it('lệch dù chỉ 2₫ → 400 kèm CẢ HAI con số', async () => {
      const a = await themNguoi('A');
      const anUong = await layDanhMuc('Ăn uống');

      const res = await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          totalAmount: 1_000_000,
          date: '2026-08-16',
          categoryId: anUong,
          shares: [
            { contactId: null, amount: 500_000 },
            { contactId: a, amount: 499_998 },
          ],
        })
        .expect(400);

      expect(res.body.message).toContain('999.998');
      expect(res.body.message).toContain('1.000.000');
    });

    it('phần mời lớn hơn phần của bạn → 400', async () => {
      const a = await themNguoi('A');
      const anUong = await layDanhMuc('Ăn uống');
      const moi = await layDanhMuc('Mời bạn bè');

      await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          totalAmount: 300_000,
          date: '2026-08-16',
          categoryId: anUong,
          treatAmount: 200_000,
          treatCategoryId: moi,
          shares: [
            { contactId: null, amount: 100_000 },
            { contactId: a, amount: 200_000 },
          ],
        })
        .expect(400);
    });

    it('chọn danh mục hệ thống cho phần của mình → 400', async () => {
      const a = await themNguoi('A');
      // `GET /categories` cố ý ẩn danh mục hệ thống khỏi form nhập liệu, nên phải lấy
      // thẳng từ DB để giả lập client cố tình gửi id đó lên
      const [{ id: heThong }] = await dataSource.query<{ id: string }[]>(
        `SELECT id FROM categories WHERE "userId"=$1 AND name='Trả hộ bạn bè' AND type='expense'`,
        [user.id],
      );

      await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          totalAmount: 200_000,
          date: '2026-08-16',
          categoryId: heThong,
          shares: [
            { contactId: null, amount: 100_000 },
            { contactId: a, amount: 100_000 },
          ],
        })
        .expect(400);
    });

    it('người không có trong danh bạ của mình → 404', async () => {
      const nguoiKhac = await registerOnboardedUser(server);
      const cuaHo = await request(server as never)
        .post(`${API}/contacts`)
        .set(nguoiKhac.auth)
        .send({ name: 'Người lạ' });

      const anUong = await layDanhMuc('Ăn uống');

      await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          totalAmount: 200_000,
          date: '2026-08-16',
          categoryId: anUong,
          shares: [
            { contactId: null, amount: 100_000 },
            { contactId: cuaHo.body.data.id, amount: 100_000 },
          ],
        })
        .expect(404);
    });
  });

  // ————————————————————— Tất toán —————————————————————

  describe('Tất toán hai chiều', () => {
    it('họ trả lại bạn → thu vào danh mục hệ thống, KHÔNG thổi phồng thu nhập', async () => {
      const a = await themNguoi('A');
      const anUong = await layDanhMuc('Ăn uống');
      const homNay = new Date().toISOString().slice(0, 10);

      await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          totalAmount: 400_000,
          date: homNay,
          categoryId: anUong,
          shares: [
            { contactId: null, amount: 200_000 },
            { contactId: a, amount: 200_000 },
          ],
        })
        .expect(201);

      const truoc = (await soDu()).currentBalance;

      await request(server as never)
        .post(`${API}/settlements`)
        .set(user.auth)
        .send({ contactId: a, direction: 'they_paid_me', amount: 200_000, date: homNay })
        .expect(201);

      expect((await soDu()).currentBalance).toBe(truoc + 200_000);
      expect(await congNo(a)).toBe(0);

      // Thu nhập trong thống kê KHÔNG được tăng — đó là tiền của chính mình quay về
      const sum = await request(server as never)
        .get(`${API}/stats/summary?period=month`)
        .set(user.auth);
      expect(sum.body.data.income).toBe(0);
    });

    /**
     * Chiều này mới là lúc bạn THỰC SỰ tiêu — nên khoản chi vào danh mục THẬT và có mặt
     * trong thống kê, dù bữa ăn đã diễn ra từ trước.
     */
    it('bạn trả lại họ → chi vào danh mục THẬT và VÀO thống kê', async () => {
      const tuan = await themNguoi('Tuấn');
      const anUong = await layDanhMuc('Ăn uống');
      const homNay = new Date().toISOString().slice(0, 10);

      await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          payerContactId: tuan,
          totalAmount: 400_000,
          date: homNay,
          categoryId: anUong,
          shares: [
            { contactId: null, amount: 100_000 },
            { contactId: tuan, amount: 300_000 },
          ],
        })
        .expect(201);

      const truoc = (await soDu()).currentBalance;

      await request(server as never)
        .post(`${API}/settlements`)
        .set(user.auth)
        .send({
          contactId: tuan,
          direction: 'i_paid_them',
          amount: 100_000,
          date: homNay,
          categoryId: anUong,
        })
        .expect(201);

      expect((await soDu()).currentBalance).toBe(truoc - 100_000);
      expect(await congNo(tuan)).toBe(0);

      const sum = await request(server as never)
        .get(`${API}/stats/summary?period=month`)
        .set(user.auth);
      expect(sum.body.data.expense).toBe(100_000);
    });

    it('bạn trả lại mà không chọn danh mục → 400', async () => {
      const tuan = await themNguoi('Tuấn');

      await request(server as never)
        .post(`${API}/settlements`)
        .set(user.auth)
        .send({
          contactId: tuan,
          direction: 'i_paid_them',
          amount: 100_000,
          date: '2026-08-16',
        })
        .expect(400);
    });

    it('trả TỪNG PHẦN — công nợ giảm dần, không phải cờ đã/chưa trả', async () => {
      const a = await themNguoi('A');
      const anUong = await layDanhMuc('Ăn uống');

      await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          totalAmount: 1_000_000,
          date: '2026-08-16',
          categoryId: anUong,
          shares: [
            { contactId: null, amount: 250_000 },
            { contactId: a, amount: 750_000 },
          ],
        })
        .expect(201);

      expect(await congNo(a)).toBe(750_000);

      for (const tien of [300_000, 200_000]) {
        await request(server as never)
          .post(`${API}/settlements`)
          .set(user.auth)
          .send({ contactId: a, direction: 'they_paid_me', amount: tien, date: '2026-08-17' })
          .expect(201);
      }

      expect(await congNo(a)).toBe(250_000);
    });

    it('trả DƯ → công nợ đổi dấu, không bị chặn', async () => {
      const a = await themNguoi('A');
      const anUong = await layDanhMuc('Ăn uống');

      await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          totalAmount: 200_000,
          date: '2026-08-16',
          categoryId: anUong,
          shares: [
            { contactId: null, amount: 100_000 },
            { contactId: a, amount: 100_000 },
          ],
        })
        .expect(201);

      await request(server as never)
        .post(`${API}/settlements`)
        .set(user.auth)
        .send({ contactId: a, direction: 'they_paid_me', amount: 150_000, date: '2026-08-17' })
        .expect(201);

      expect(await congNo(a)).toBe(-50_000); // giờ bạn nợ lại họ
    });
  });

  // ————————————————————— Thẻ số dư —————————————————————

  describe('owedToMe / owedByMe trong thẻ số dư', () => {
    it('tách đúng hai chiều và chỉ owedByMe mới trừ vào freeToSpend', async () => {
      const [a, tuan] = await Promise.all([themNguoi('A'), themNguoi('Tuấn')]);
      const anUong = await layDanhMuc('Ăn uống');

      // A nợ bạn 300k
      await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          totalAmount: 400_000,
          date: '2026-08-16',
          categoryId: anUong,
          shares: [
            { contactId: null, amount: 100_000 },
            { contactId: a, amount: 300_000 },
          ],
        })
        .expect(201);

      // Bạn nợ Tuấn 120k
      await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          payerContactId: tuan,
          totalAmount: 500_000,
          date: '2026-08-16',
          categoryId: anUong,
          shares: [
            { contactId: null, amount: 120_000 },
            { contactId: tuan, amount: 380_000 },
          ],
        })
        .expect(201);

      const b = await soDu();
      expect(b.owedToMe).toBe(300_000);
      expect(b.owedByMe).toBe(120_000);
      // owedToMe KHÔNG cộng vào: tiền đó chưa về, tiêu trước là tiêu khống
      expect(b.freeToSpend).toBe(b.currentBalance - b.committedToGoals - 120_000);
    });
  });

  // ————————————————————— Xóa —————————————————————

  describe('Xóa', () => {
    it('xóa khoản chi chung → xóa kèm CẢ 3 giao dịch, số dư về đúng như cũ', async () => {
      const truoc = (await soDu()).currentBalance;
      const a = await themNguoi('A');
      const anUong = await layDanhMuc('Ăn uống');
      const moi = await layDanhMuc('Mời bạn bè');

      const res = await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          totalAmount: 900_000,
          date: '2026-08-16',
          categoryId: anUong,
          treatAmount: 100_000,
          treatCategoryId: moi,
          shares: [
            { contactId: null, amount: 400_000 },
            { contactId: a, amount: 500_000 },
          ],
        })
        .expect(201);

      await request(server as never)
        .delete(`${API}/shared-expenses/${res.body.data.id}`)
        .set(user.auth)
        .expect(204);

      expect((await soDu()).currentBalance).toBe(truoc);
      expect(await congNo(a)).toBe(0);

      const tx = await request(server as never)
        .get(`${API}/transactions?limit=20`)
        .set(user.auth);
      expect(tx.body.data.items).toHaveLength(0);
    });

    it('xóa người còn công nợ → 409 kèm số tiền cụ thể', async () => {
      const a = await themNguoi('A');
      const anUong = await layDanhMuc('Ăn uống');

      await request(server as never)
        .post(`${API}/shared-expenses`)
        .set(user.auth)
        .send({
          totalAmount: 400_000,
          date: '2026-08-16',
          categoryId: anUong,
          shares: [
            { contactId: null, amount: 100_000 },
            { contactId: a, amount: 300_000 },
          ],
        })
        .expect(201);

      const res = await request(server as never)
        .delete(`${API}/contacts/${a}`)
        .set(user.auth)
        .expect(409);

      expect(res.body.message).toContain('300.000');
    });

    it('công nợ đã về 0 thì xóa được', async () => {
      const a = await themNguoi('A');
      await request(server as never).delete(`${API}/contacts/${a}`).set(user.auth).expect(204);
    });
  });
});
