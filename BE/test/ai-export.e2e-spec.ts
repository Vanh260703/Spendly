import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  SYSTEM_PROMPT,
  buildFinancialContext,
  buildNecessityPrompt,
  buildPeriodReportPrompt,
  hashInput,
} from '../src/modules/ai/ai-prompt.builder';
import { baoCaoDaChot } from '../src/modules/ai/ai.scheduler';
import { AiInsight, InsightKind } from '../src/modules/ai/entities/ai-insight.entity';
import { LlmClient } from '../src/modules/ai/llm.client';
import { TestUser, registerOnboardedUser } from './utils/auth-helper';
import { createTestApp, truncateAll } from './utils/test-app';

const API = '/api/v1';

describe('AI · Export (e2e)', () => {
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

  const chi = (amount: number, categoryId = cat['Ăn vặt & cà phê'], note?: string) =>
    request(server as never)
      .post(`${API}/transactions`)
      .set(user.auth)
      .send({
        type: 'expense',
        amount,
        categoryId,
        date: new Date().toISOString(),
        ...(note && { note }),
      })
      .expect(201);

  // ═══════════ Prompt builder — test thuần, KHÔNG gọi mạng ═══════════

  describe('Prompt builder (không gọi API, không tốn quota)', () => {
    const duLieuMau = {
      periodLabel: '2026-08-06 → 2026-08-12',
      income: 20_000_000,
      expense: 1_240_000,
      monthlyIncome: 20_000_000,
      byKind: { need: 690_000, want: 550_000, saving: 0 },
      categories: [
        {
          category: { id: 'c1', name: 'Ăn vặt & cà phê', kind: 'want' },
          total: 550_000,
          count: 11,
          average: 50_000,
          percentOfExpense: 0.443,
          percentOfIncome: 0.0275,
          vsPrevious3Avg: 0.68,
        },
      ],
      goals: [{ name: 'Mua Macbook', monthlyTarget: 3_500_000 }],
      daysOfData: 7,
    };

    it('system prompt khóa 3 ràng buộc quan trọng nhất', () => {
      expect(SYSTEM_PROMPT).toContain('KHÔNG BỊA SỐ');
      // Không có luật này AI sẽ khuyên cắt tiền nhà, thuốc men
      expect(SYSTEM_PROMPT).toContain('kind="want"');
      expect(SYSTEM_PROMPT).toContain('KHÔNG đề xuất cắt kind="need"');
      expect(SYSTEM_PROMPT).toContain('lãng phí');
    });

    it('prompt gửi CẢ TẦN SUẤT, không chỉ tổng tiền', () => {
      const p = buildNecessityPrompt(duLieuMau);
      // Thiếu số lần thì AI không phân biệt được "1 lần 550k" với "11 lần 50k"
      expect(p).toContain('11 lần');
      expect(p).toContain('TB 50.000₫/lần');
      expect(p).toContain('550.000₫');
      expect(p).toContain('[want]');
      expect(p).toContain('+68%');
    });

    it('prompt kèm mục tiêu để quy đổi ra % tiến độ', () => {
      expect(buildNecessityPrompt(duLieuMau)).toContain('Mua Macbook');
    });

    it('chưa đủ dữ liệu so sánh → ghi rõ thay vì để trống', () => {
      const p = buildNecessityPrompt({
        ...duLieuMau,
        categories: [{ ...duLieuMau.categories[0], vsPrevious3Avg: null }],
      });
      expect(p).toContain('chưa đủ dữ liệu');
    });

    it('KHÔNG gửi giao dịch thô — chỉ số liệu đã tổng hợp', () => {
      const p = buildNecessityPrompt(duLieuMau);
      expect(p).not.toContain('transactionId');
      expect(p).not.toContain('walletId');
      expect(p.length).toBeLessThan(3000); // đủ gọn để không đốt token
    });

    it('bối cảnh cho CHAT không kèm chỉ thị JSON', () => {
      // Bug đã gặp: chat dùng chung buildNecessityPrompt nên thừa hưởng câu "trả về JSON",
      // user hỏi một câu bình thường mà nhận về khối JSON thô
      const ctx = buildFinancialContext(duLieuMau);
      expect(ctx).not.toContain('JSON');
      expect(ctx).not.toContain('verdict');
      // nhưng vẫn phải có đủ dữ liệu
      expect(ctx).toContain('11 lần');
    });

    it('prompt cho NECESSITY thì phải có chỉ thị JSON', () => {
      const p = buildNecessityPrompt(duLieuMau);
      expect(p).toContain('JSON');
      expect(p).toContain('verdict');
    });

    it('prompt BÁO CÁO KỲ có đủ ngân sách · mục tiêu · nợ · so sánh kỳ trước', () => {
      const p = buildPeriodReportPrompt({
        ...duLieuMau,
        previousExpense: 9_000_000,
        changePercent: 0.3,
        budgets: [{ name: 'Ăn uống', spent: 3_200_000, limit: 3_000_000, status: 'đã vượt' }],
        goals: [
          { name: 'Mua Macbook', monthlyTarget: 5_000_000, progress: 0.1, contributedThisPeriod: 0 },
        ],
        debts: [{ name: 'Thẻ tín dụng', remaining: 18_000_000, interestRate: 24 }],
      });

      // Báo cáo nhìn TOÀN CẢNH, khác necessity chỉ soi danh mục chi
      expect(p).toContain('SO VỚI KỲ TRƯỚC');
      expect(p).toContain('đã vượt');
      expect(p).toContain('Thẻ tín dụng');
      expect(p).toContain('+30%');
      // 4 phần đầu ra theo đúng thứ tự người ta muốn đọc
      expect(p).toContain('highlights');
      expect(p).toContain('warnings');
      expect(p).toContain('actions');
    });

    it('hashInput ổn định: cùng dữ liệu ra cùng hash, đổi 1 số là đổi hash', () => {
      // Đây là cơ chế chính giúp không gọi lại API khi dữ liệu chưa đổi
      expect(hashInput(duLieuMau)).toBe(hashInput({ ...duLieuMau }));
      expect(hashInput(duLieuMau)).not.toBe(
        hashInput({ ...duLieuMau, expense: 1_240_001 }),
      );
    });
  });

  // ═══════════ Hành vi khi chưa cấu hình API key ═══════════

  describe('Chưa cấu hình LLM_API_KEY', () => {
    it('client báo chưa cấu hình', () => {
      expect(app.get(LlmClient).isConfigured).toBe(false);
    });

    it('necessity-review → 503 (app không gãy, FE hiện fallback thống kê)', async () => {
      await chi(550_000);
      const res = await request(server as never)
        .get(`${API}/ai/necessity-review`)
        .set(user.auth)
        .expect(503);

      expect(res.body.message).toContain('AI');
    });

    it('health-score → 503', async () => {
      await request(server as never)
        .get(`${API}/ai/health-score`)
        .set(user.auth)
        .expect(503);
    });

    it('báo cáo kỳ → 503', async () => {
      await chi(550_000);
      await request(server as never)
        .get(`${API}/ai/report`)
        .set(user.auth)
        .expect(503);
    });

    it('chat → 503', async () => {
      await request(server as never)
        .post(`${API}/ai/chat`)
        .set(user.auth)
        .send({ message: 'Tháng này tôi tiêu nhiều không?' })
        .expect(503);
    });

    it('GET /ai/insights vẫn 200 — chỉ đọc DB, không gọi API', async () => {
      const res = await request(server as never)
        .get(`${API}/ai/insights`)
        .set(user.auth)
        .expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('chưa có giao dịch → 400 với thông báo rõ, không phải 503', async () => {
      await request(server as never)
        .get(`${API}/ai/necessity-review`)
        .set(user.auth)
        .expect(400);
    });
  });

  // ═══════════ Dữ liệu AI nhận được ═══════════

  describe('Dữ liệu đưa vào AI', () => {
    it('by-category cho AI đủ 5 chiều cần thiết', async () => {
      for (let i = 0; i < 11; i++) await chi(50_000);

      const res = await request(server as never)
        .get(`${API}/stats/by-category`)
        .set(user.auth)
        .expect(200);

      const r = res.body.data[0];
      expect(r).toHaveProperty('total');
      expect(r).toHaveProperty('count');
      expect(r).toHaveProperty('average');
      expect(r).toHaveProperty('percentOfIncome');
      expect(r).toHaveProperty('vsPrevious3Avg');
      expect(r.category).toHaveProperty('kind');
    });
  });

  // ═══════════ Export ═══════════


  /**
   * Hồi quy cho một lỗi thật: kho báo cáo từng cho phép NHIỀU bản ghi cho CÙNG một kỳ.
   *
   * Khóa duy nhất đặt nhầm trên `inputHash` — mà trong kỳ đang chạy, mỗi lần user nhập
   * thêm giao dịch rồi mở `/ai` là dữ liệu đổi → hash đổi → thêm một bản ghi nữa cho cùng
   * tuần đó. Trang "Báo cáo chi tiêu" hiện 4–5 mục trùng tên một tuần, và job sáng Thứ Hai
   * thấy "đã có" nên bỏ qua → bản dang dở giữa tuần bị giữ lại làm báo cáo tổng kết.
   */
  describe('Kho báo cáo · MỘT bản ghi cho MỖI kỳ', () => {
    const KY = {
      start: new Date('2026-08-10T00:00:00+07:00'),
      end: new Date('2026-08-16T23:59:59.999+07:00'),
    };

    const dungBaoCao = (u: TestUser, over: Partial<AiInsight> = {}) =>
      dataSource.getRepository(AiInsight).create({
        userId: u.id,
        kind: InsightKind.WEEKLY,
        periodStart: KY.start,
        periodEnd: KY.end,
        inputHash: 'h',
        content: 'x',
        model: 'm',
        ...over,
      });

    it('DB CHẶN hai báo cáo cho cùng một tuần, kể cả khi dữ liệu đầu vào khác nhau', async () => {
      const repo = dataSource.getRepository(AiInsight);
      const u = await registerOnboardedUser(server);

      await repo.save(dungBaoCao(u, { inputHash: 'giua_tuan_3_ngay' }));

      await expect(
        repo.save(dungBaoCao(u, { inputHash: 'het_tuan_7_ngay' })),
      ).rejects.toThrow(/duplicate key|UQ_/i);

      expect(await repo.countBy({ userId: u.id })).toBe(1);
    });

    it('sinh lại báo cáo của một kỳ thì GHI ĐÈ, không đẻ thêm dòng', async () => {
      const repo = dataSource.getRepository(AiInsight);
      const u = await registerOnboardedUser(server);

      await repo.save(dungBaoCao(u, { content: 'dựng từ 3 ngày' }));
      await repo.upsert(
        { ...dungBaoCao(u, { content: 'dựng từ 7 ngày', inputHash: 'h2' }) },
        { conflictPaths: ['userId', 'kind', 'periodStart'] },
      );

      const rows = await repo.findBy({ userId: u.id });
      expect(rows).toHaveLength(1);
      expect(rows[0].content).toBe('dựng từ 7 ngày');
    });

    it('GET /ai/insights không trả bản ghi hỏng (periodStart == periodEnd)', async () => {
      const repo = dataSource.getRepository(AiInsight);
      const u = await registerOnboardedUser(server);
      const luc = new Date('2026-08-14T10:34:45+07:00');

      // Bản ghi kiểu cũ: cả hai mốc đều là LÚC SINH RA, không phải kỳ nó nói về
      await repo.save(dungBaoCao(u, { periodStart: luc, periodEnd: luc, inputHash: 'cu' }));
      await repo.save(dungBaoCao(u, { content: 'báo cáo tử tế' }));

      const res = await request(server as never)
        .get(`${API}/ai/insights`)
        .set(u.auth)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].content).toBe('báo cáo tử tế');
    });
  });

  /**
   * Job sáng Thứ Hai phải phân biệt "đã có báo cáo" với "đã có báo cáo CHỐT".
   * Bỏ qua nhầm một bản dang dở là mất luôn báo cáo tổng kết của tuần đó.
   */
  describe('AiScheduler · khi nào coi là đã chốt', () => {
    const ketThucKy = new Date('2026-08-16T23:59:59.999+07:00');
    const luc = (iso: string) => ({ updatedAt: new Date(iso) });

    it('chưa có gì → phải sinh', () => {
      expect(baoCaoDaChot(null, ketThucKy)).toBe(false);
    });

    it('bản sinh GIỮA kỳ → chưa chốt, phải sinh lại bằng dữ liệu đủ', () => {
      expect(baoCaoDaChot(luc('2026-08-13T09:00:00+07:00'), ketThucKy)).toBe(false);
    });

    it('bản sinh SAU khi kỳ đóng → đã chốt, bỏ qua', () => {
      expect(baoCaoDaChot(luc('2026-08-17T08:00:00+07:00'), ketThucKy)).toBe(true);
    });

    it('chạy lại những ngày sau vẫn bỏ qua — job idempotent', () => {
      const daChot = luc('2026-08-17T08:00:00+07:00');
      for (const _ of [1, 2, 3]) expect(baoCaoDaChot(daChot, ketThucKy)).toBe(true);
    });
  });

  describe('GET /export/excel', () => {
    it('xuất CSV có BOM để Excel đọc đúng tiếng Việt', async () => {
      await chi(150_000, cat['Ăn vặt & cà phê'], 'Cà phê sáng');

      const res = await request(server as never)
        .get(`${API}/export/excel`)
        .set(user.auth)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');

      const text = res.text ?? res.body.toString('utf8');
      // Thiếu BOM thì Excel trên Windows hiện tiếng Việt thành ký tự rác
      expect(text.charCodeAt(0)).toBe(0xfeff);
      expect(text).toContain('Ngày,Loại,Số tiền');
      expect(text).toContain('Cà phê sáng');
      expect(text).toContain('Chi');
    });

    it('escape ghi chú có dấu phẩy / nháy kép để không vỡ cấu trúc file', async () => {
      await chi(50_000, cat['Ăn vặt & cà phê'], 'Ăn trưa, cà phê và "bánh mì"');

      const res = await request(server as never)
        .get(`${API}/export/excel`)
        .set(user.auth)
        .expect(200);

      const text = res.text ?? res.body.toString('utf8');
      expect(text).toContain('"Ăn trưa, cà phê và ""bánh mì"""');
    });

    it('lọc theo khoảng ngày', async () => {
      await request(server as never)
        .post(`${API}/transactions`)
        .set(user.auth)
        .send({
          type: 'expense',
          amount: 111_000,
          categoryId: cat['Ăn vặt & cà phê'],
          date: '2020-01-15T00:00:00.000Z',
        })
        .expect(201);
      await chi(222_000);

      const res = await request(server as never)
        .get(`${API}/export/excel?from=2019-01-01T00:00:00.000Z&to=2021-01-01T00:00:00.000Z`)
        .set(user.auth)
        .expect(200);

      const text = res.text ?? res.body.toString('utf8');
      expect(text).toContain('111000');
      expect(text).not.toContain('222000');
    });

    it('chỉ xuất dữ liệu của chính mình', async () => {
      await chi(999_000);
      const nguoiKhac = await registerOnboardedUser(server);

      const res = await request(server as never)
        .get(`${API}/export/excel`)
        .set(nguoiKhac.auth)
        .expect(200);

      const text = res.text ?? res.body.toString('utf8');
      expect(text).not.toContain('999000');
    });

    it('không token → 401', async () => {
      await request(server as never).get(`${API}/export/excel`).expect(401);
    });
  });
});
