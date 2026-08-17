import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { BudgetsService } from '../src/modules/budgets/budgets.service';
import { TestUser, registerOnboardedUser } from './utils/auth-helper';
import { createTestApp, truncateAll } from './utils/test-app';

const API = '/api/v1';

describe('Budgets · Goals · Debts (e2e)', () => {
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

  const chi = (amount: number, categoryId = cat['Ăn vặt & cà phê']) =>
    request(server as never)
      .post(`${API}/transactions`)
      .set(user.auth)
      .send({ type: 'expense', amount, categoryId, date: new Date().toISOString() })
      .expect(201);

  // ═══════════════════════════ BUDGETS ═══════════════════════════

  describe('Budgets', () => {
    const taoNganSach = (over = {}) =>
      request(server as never)
        .post(`${API}/budgets`)
        .set(user.auth)
        .send({ categoryId: cat['Ăn vặt & cà phê'], amount: 3_000_000, ...over });

    it('trả kèm số đã tiêu của kỳ hiện tại — FE không phải tự tính', async () => {
      await chi(2_400_000);
      const res = await taoNganSach().expect(201);

      expect(res.body.data).toMatchObject({
        amount: 3_000_000,
        effectiveAmount: 3_000_000,
        spent: 2_400_000,
        remaining: 600_000,
        progress: 0.8,
        status: 'warning',
      });
    });

    it('spent tính TRỌN KỲ, kể cả khoản tiêu trước khi tạo ngân sách', async () => {
      // Con số phải nói đúng sự thật về tháng này, hiện 0% sẽ khiến user tưởng còn nguyên
      await chi(2_400_000);
      const res = await taoNganSach().expect(201);
      expect(res.body.data.spent).toBe(2_400_000);
    });

    it('trạng thái đổi theo mức tiêu: ok → warning → exceeded', async () => {
      const b = await taoNganSach({ amount: 1_000_000 }).expect(201);
      expect(b.body.data.status).toBe('ok');

      await chi(1_500_000);
      const sau = await request(server as never).get(`${API}/budgets`).set(user.auth);
      expect(sau.body.data[0].status).toBe('exceeded');
      expect(sau.body.data[0].remaining).toBe(-500_000);
    });

    it('ngân sách TỔNG (categoryId = null) tính toàn bộ chi tiêu', async () => {
      await chi(500_000);
      await chi(300_000, cat['Nhà ở']);

      const res = await taoNganSach({ categoryId: null, amount: 5_000_000 }).expect(201);
      expect(res.body.data.category).toBeNull();
      expect(res.body.data.spent).toBe(800_000);
    });

    it('LOẠI giao dịch điều chỉnh số dư khỏi số đã tiêu', async () => {
      await chi(100_000);
      await request(server as never)
        .post(`${API}/transactions/adjust-balance`)
        .set(user.auth)
        .send({ actualBalance: 1_000_000 })
        .expect(201);

      const res = await taoNganSach().expect(201);
      expect(res.body.data.spent).toBe(100_000);
    });

    it('một danh mục chỉ có một ngân sách đang chạy → 409', async () => {
      await taoNganSach().expect(201);
      await taoNganSach().expect(409);
    });

    it('không đặt ngân sách cho danh mục hệ thống → 409', async () => {
      const [sys] = await dataSource.query(
        `SELECT id FROM categories WHERE "userId" = $1 AND "isSystem" AND type='expense'`,
        [user.id],
      );
      await taoNganSach({ categoryId: sys.id }).expect(409);
    });

    it('rollover: dư kỳ trước được cộng vào hạn mức kỳ này', async () => {
      const b = await taoNganSach({ rollover: true }).expect(201);

      await dataSource.query(
        `INSERT INTO budget_period_results
         ("userId","budgetId","categoryId","categoryName",period,"periodStart","periodEnd",
          amount,"rolloverIn","effectiveAmount",spent,"rolloverOut")
         VALUES ($1,$2,$3,'Ăn vặt & cà phê','monthly',
                 now() - interval '2 month', now() - interval '1 month',
                 3000000, 0, 3000000, 2500000, 500000)`,
        [user.id, b.body.data.id, cat['Ăn vặt & cà phê']],
      );

      const res = await request(server as never).get(`${API}/budgets`).set(user.auth);
      expect(res.body.data[0].rolloverIn).toBe(500_000);
      expect(res.body.data[0].effectiveAmount).toBe(3_500_000);
    });

    it('rollover ÂM: vượt kỳ trước thì kỳ này bị trừ', async () => {
      // Chỉ cộng khi dư mà không trừ khi vượt sẽ biến ngân sách thành phần thưởng một chiều
      const b = await taoNganSach({ rollover: true }).expect(201);

      await dataSource.query(
        `INSERT INTO budget_period_results
         ("userId","budgetId","categoryId","categoryName",period,"periodStart","periodEnd",
          amount,"rolloverIn","effectiveAmount",spent,"rolloverOut")
         VALUES ($1,$2,$3,'x','monthly', now() - interval '2 month', now() - interval '1 month',
                 3000000, 0, 3000000, 3300000, -300000)`,
        [user.id, b.body.data.id, cat['Ăn vặt & cà phê']],
      );

      const res = await request(server as never).get(`${API}/budgets`).set(user.auth);
      expect(res.body.data[0].rolloverIn).toBe(-300_000);
      expect(res.body.data[0].effectiveAmount).toBe(2_700_000);
    });

    it('job chốt kỳ: idempotent, chạy 2 lần không tạo bản ghi trùng', async () => {
      const b = await taoNganSach().expect(201);
      await dataSource.query(`UPDATE budgets SET "startDate" = now() - interval '3 month'`);

      const svc = app.get(BudgetsService);
      await svc.closeDuePeriods();
      await svc.closeDuePeriods();

      const [{ count }] = await dataSource.query(
        'SELECT count(*)::int FROM budget_period_results WHERE "budgetId" = $1',
        [b.body.data.id],
      );
      expect(count).toBe(1);
    });

    it('xóa ngân sách KHÔNG xóa lịch sử kỳ đã chốt', async () => {
      const b = await taoNganSach().expect(201);
      await dataSource.query(`UPDATE budgets SET "startDate" = now() - interval '3 month'`);
      await app.get(BudgetsService).closeDuePeriods();

      await request(server as never)
        .delete(`${API}/budgets/${b.body.data.id}`)
        .set(user.auth)
        .expect(204);

      // Đây chính là lý do bảng lịch sử tồn tại — mất nó thì không chấm được
      // budgetAdherence theo thời gian
      const res = await request(server as never)
        .get(`${API}/budgets/history`)
        .set(user.auth)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].categoryName).toBe('Ăn vặt & cà phê');
    });
  });

  // ═══════════════════════════ GOALS ═══════════════════════════

  describe('Goals', () => {
    const taoMucTieu = (over = {}) =>
      request(server as never)
        .post(`${API}/goals`)
        .set(user.auth)
        .send({ name: 'Mua Macbook', horizon: 'short', targetAmount: 35_000_000, ...over });

    it('tính requiredMonthly và onTrack ở BE, không đẩy sang FE', async () => {
      const deadline = new Date();
      deadline.setMonth(deadline.getMonth() + 10);

      const res = await taoMucTieu({
        deadline: deadline.toISOString(),
        monthlyContribution: 1_000_000,
      }).expect(201);

      // Cần ~3,5tr/tháng mà chỉ định trích 1tr → đang chậm tiến độ
      expect(res.body.data.requiredMonthly).toBeGreaterThan(3_000_000);
      expect(res.body.data.onTrack).toBe(false);
    });

    it('không có deadline → onTrack = null (không có gì để so)', async () => {
      const res = await taoMucTieu().expect(201);
      expect(res.body.data.onTrack).toBeNull();
      expect(res.body.data.requiredMonthly).toBeNull();
    });

    it('nạp tiền KHÔNG tạo giao dịch — số dư giữ nguyên', async () => {
      const g = await taoMucTieu().expect(201);

      await request(server as never)
        .post(`${API}/goals/${g.body.data.id}/contribute`)
        .set(user.auth)
        .send({ amount: 4_000_000 })
        .expect(201);

      const bal = await request(server as never)
        .get(`${API}/stats/balance`)
        .set(user.auth)
        .expect(200);

      // Tiền chưa rời ví, chỉ là đã có chủ
      expect(bal.body.data.currentBalance).toBe(12_000_000);
      expect(bal.body.data.committedToGoals).toBe(4_000_000);
      expect(bal.body.data.freeToSpend).toBe(8_000_000);

      const [{ count }] = await dataSource.query(
        'SELECT count(*)::int FROM transactions WHERE "userId" = $1',
        [user.id],
      );
      expect(count).toBe(0);
    });

    it('CHẶN nạp vượt số tiền đang có → 409', async () => {
      const g = await taoMucTieu({ targetAmount: 100_000_000 }).expect(201);
      await request(server as never)
        .post(`${API}/goals/${g.body.data.id}/contribute`)
        .set(user.auth)
        .send({ amount: 50_000_000 })
        .expect(409);
    });

    it('chặn tổng cam kết vượt số dư dù từng lần đều nhỏ', async () => {
      const g1 = await taoMucTieu({ name: 'A' }).expect(201);
      const g2 = await taoMucTieu({ name: 'B' }).expect(201);

      await request(server as never)
        .post(`${API}/goals/${g1.body.data.id}/contribute`)
        .set(user.auth)
        .send({ amount: 8_000_000 })
        .expect(201);

      // 8tr + 6tr > 12tr
      await request(server as never)
        .post(`${API}/goals/${g2.body.data.id}/contribute`)
        .set(user.auth)
        .send({ amount: 6_000_000 })
        .expect(409);
    });

    it('đạt đích → tự chuyển trạng thái achieved', async () => {
      const g = await taoMucTieu({ targetAmount: 5_000_000 }).expect(201);
      const res = await request(server as never)
        .post(`${API}/goals/${g.body.data.id}/contribute`)
        .set(user.auth)
        .send({ amount: 5_000_000 })
        .expect(201);

      expect(res.body.data.status).toBe('achieved');
      expect(res.body.data.progress).toBe(1);
    });

    it('không nạp được vào mục tiêu đã hoàn thành → 409', async () => {
      const g = await taoMucTieu({ targetAmount: 1_000_000 }).expect(201);
      await request(server as never)
        .post(`${API}/goals/${g.body.data.id}/contribute`)
        .set(user.auth)
        .send({ amount: 1_000_000 })
        .expect(201);

      await request(server as never)
        .post(`${API}/goals/${g.body.data.id}/contribute`)
        .set(user.auth)
        .send({ amount: 100_000 })
        .expect(409);
    });

    it('lịch sử nạp tiền được ghi lại', async () => {
      const g = await taoMucTieu().expect(201);
      await request(server as never)
        .post(`${API}/goals/${g.body.data.id}/contribute`)
        .set(user.auth)
        .send({ amount: 1_000_000, note: 'Thưởng tết' })
        .expect(201);

      const res = await request(server as never)
        .get(`${API}/goals/${g.body.data.id}/contributions`)
        .set(user.auth)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].note).toBe('Thưởng tết');
    });

    it('CỘNG DỒN: kỳ nào không nạp thì số cần nạp kỳ sau đội lên', async () => {
      // Cùng số tiền còn thiếu, hạn càng gần thì mỗi kỳ phải nạp càng nhiều —
      // đây chính là cơ chế "bỏ lỡ tháng này thì tháng sau gánh nặng hơn"
      const soTien = (deadline: string) =>
        request(server as never)
          .post(`${API}/goals`)
          .set(user.auth)
          .send({
            name: `Test ${deadline}`,
            horizon: 'short',
            targetAmount: 36_000_000,
            deadline,
            monthlyContribution: 1_000_000,
          })
          .expect(201)
          .then((r) => r.body.data.requiredMonthly as number);

      const xa = new Date();
      xa.setMonth(xa.getMonth() + 6);
      const gan = new Date();
      gan.setMonth(gan.getMonth() + 2);

      const canKhiConXa = await soTien(xa.toISOString());
      const canKhiSapHet = await soTien(gan.toISOString());

      expect(canKhiSapHet).toBeGreaterThan(canKhiConXa);
    });

    it('theo dõi ĐÃ NẠP trong kỳ này, tách khỏi kế hoạch tự khai', async () => {
      const g = await taoMucTieu({ monthlyContribution: 1_000_000 }).expect(201);

      // Chưa nạp gì
      let res = await request(server as never)
        .get(`${API}/goals/${g.body.data.id}`)
        .set(user.auth)
        .expect(200);
      expect(res.body.data.contributedThisPeriod).toBe(0);

      await request(server as never)
        .post(`${API}/goals/${g.body.data.id}/contribute`)
        .set(user.auth)
        .send({ amount: 3_000_000 })
        .expect(201);

      res = await request(server as never)
        .get(`${API}/goals/${g.body.data.id}`)
        .set(user.auth)
        .expect(200);
      expect(res.body.data.contributedThisPeriod).toBe(3_000_000);
    });

    it('quá hạn mà chưa đủ → overdue = true, cần nạp TOÀN BỘ phần còn thiếu', async () => {
      const quaKhu = new Date();
      quaKhu.setMonth(quaKhu.getMonth() - 2);

      const g = await taoMucTieu({
        targetAmount: 10_000_000,
        deadline: quaKhu.toISOString(),
      }).expect(201);

      expect(g.body.data.overdue).toBe(true);
      // Không chia cho số kỳ nữa — chia cho 1 kỳ quá khứ là vô nghĩa
      expect(g.body.data.requiredMonthly).toBe(10_000_000);
      expect(g.body.data.monthsLeft).toBe(0);
    });

    it('mục tiêu của user khác → 404', async () => {
      const g = await taoMucTieu().expect(201);
      const nguoiKhac = await registerOnboardedUser(server);
      await request(server as never)
        .get(`${API}/goals/${g.body.data.id}`)
        .set(nguoiKhac.auth)
        .expect(404);
    });
  });

  // ═══════════════════════════ DEBTS ═══════════════════════════

  describe('Debts', () => {
    const taoNo = (over = {}) =>
      request(server as never)
        .post(`${API}/debts`)
        .set(user.auth)
        .send({
          name: 'Vay mua xe',
          principal: 200_000_000,
          interestRate: 9.5,
          minPayment: 5_000_000,
          dueDay: 15,
          ...over,
        });

    it('tạo khoản nợ → còn nợ đúng bằng tiền gốc', async () => {
      const res = await taoNo().expect(201);
      expect(res.body.data).toMatchObject({
        principal: 200_000_000,
        remaining: 200_000_000,
        paid: 0,
        isPaid: false,
      });
    });

    it('ghi trả nợ → giảm số còn nợ, ghi lịch sử', async () => {
      const d = await taoNo().expect(201);
      const res = await request(server as never)
        .post(`${API}/debts/${d.body.data.id}/payment`)
        .set(user.auth)
        .send({ amount: 20_000_000 })
        .expect(201);

      expect(res.body.data.remaining).toBe(180_000_000);
      expect(res.body.data.progress).toBe(0.1);

      const ls = await request(server as never)
        .get(`${API}/debts/${d.body.data.id}/payments`)
        .set(user.auth)
        .expect(200);
      expect(ls.body.data).toHaveLength(1);
    });

    it('trả dư không làm nợ âm, tự đánh dấu đã trả xong', async () => {
      const d = await taoNo({ principal: 5_000_000 }).expect(201);
      const res = await request(server as never)
        .post(`${API}/debts/${d.body.data.id}/payment`)
        .set(user.auth)
        .send({ amount: 9_000_000 })
        .expect(201);

      expect(res.body.data.remaining).toBe(0);
      expect(res.body.data.isPaid).toBe(true);
    });

    it('không trả tiếp khoản đã tất toán → 409', async () => {
      const d = await taoNo({ principal: 1_000_000 }).expect(201);
      await request(server as never)
        .post(`${API}/debts/${d.body.data.id}/payment`)
        .set(user.auth)
        .send({ amount: 1_000_000 })
        .expect(201);

      await request(server as never)
        .post(`${API}/debts/${d.body.data.id}/payment`)
        .set(user.auth)
        .send({ amount: 100_000 })
        .expect(409);
    });

    it('avalanche ưu tiên khoản LÃI CAO nhất trước', async () => {
      await taoNo({ name: 'Thẻ tín dụng', principal: 20_000_000, interestRate: 24, minPayment: 2_000_000 });
      await taoNo({ name: 'Vay xe', principal: 50_000_000, interestRate: 9.5, minPayment: 3_000_000 });

      const res = await request(server as never)
        .get(`${API}/debts/payoff-plan?strategy=avalanche&extraPayment=5000000`)
        .set(user.auth)
        .expect(200);

      expect(res.body.data.order[0].name).toBe('Thẻ tín dụng');
      expect(res.body.data.debtFreeDate).toEqual(expect.any(String));
    });

    it('snowball ưu tiên khoản NHỎ nhất trước', async () => {
      await taoNo({ name: 'Nợ to lãi cao', principal: 50_000_000, interestRate: 24, minPayment: 3_000_000 });
      await taoNo({ name: 'Nợ nhỏ', principal: 5_000_000, interestRate: 5, minPayment: 1_000_000 });

      const res = await request(server as never)
        .get(`${API}/debts/payoff-plan?strategy=snowball&extraPayment=3000000`)
        .set(user.auth)
        .expect(200);

      expect(res.body.data.order[0].name).toBe('Nợ nhỏ');
    });

    it('avalanche tốn ÍT lãi hơn snowball (đúng bản chất 2 chiến lược)', async () => {
      await taoNo({ name: 'A', principal: 30_000_000, interestRate: 24, minPayment: 1_000_000 });
      await taoNo({ name: 'B', principal: 10_000_000, interestRate: 5, minPayment: 500_000 });

      const av = await request(server as never)
        .get(`${API}/debts/payoff-plan?strategy=avalanche&extraPayment=2000000`)
        .set(user.auth);
      const sn = await request(server as never)
        .get(`${API}/debts/payoff-plan?strategy=snowball&extraPayment=2000000`)
        .set(user.auth);

      expect(av.body.data.totalInterest).toBeLessThan(sn.body.data.totalInterest);
    });

    it('không có nợ → kế hoạch rỗng, không lỗi', async () => {
      const res = await request(server as never)
        .get(`${API}/debts/payoff-plan`)
        .set(user.auth)
        .expect(200);

      expect(res.body.data.order).toEqual([]);
      expect(res.body.data.debtFreeDate).toBeNull();
    });

    it('trả tối thiểu không đủ bù lãi → debtFreeDate = null thay vì treo vô hạn', async () => {
      await taoNo({ principal: 100_000_000, interestRate: 30, minPayment: 100_000 }).expect(201);
      const res = await request(server as never)
        .get(`${API}/debts/payoff-plan`)
        .set(user.auth)
        .expect(200);

      expect(res.body.data.debtFreeDate).toBeNull();
    });
  });
});
