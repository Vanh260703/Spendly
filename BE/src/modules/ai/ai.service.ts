import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { resolvePeriod } from '../../common/utils/period';
import { RedisKeys, RedisService, RedisTtl } from '../../shared/redis';
import { BudgetsService } from '../budgets/budgets.service';
import { Debt } from '../debts/entities/debt.entity';
import { GoalsService } from '../goals/goals.service';
import { Goal, GoalStatus } from '../goals/entities/goal.entity';
import { StatsService } from '../stats/stats.service';
import { TxType } from '../transactions/entities/transaction.entity';
import { User } from '../users/entities/user.entity';
import {
  NecessityInput,
  PeriodReportInput,
  SYSTEM_PROMPT,
  buildFinancialContext,
  buildHealthScorePrompt,
  buildNecessityPrompt,
  buildPeriodReportPrompt,
  hashInput,
} from './ai-prompt.builder';
import { AiInsight, InsightKind } from './entities/ai-insight.entity';
import { ChatMessage, ChatRole } from './entities/chat-message.entity';
import { LlmClient } from './llm.client';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @InjectRepository(AiInsight) private readonly insights: Repository<AiInsight>,
    @InjectRepository(ChatMessage) private readonly chats: Repository<ChatMessage>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Goal) private readonly goals: Repository<Goal>,
    @InjectRepository(Debt) private readonly debts: Repository<Debt>,
    private readonly stats: StatsService,
    private readonly budgets: BudgetsService,
    private readonly goalsService: GoalsService,
    private readonly llm: LlmClient,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  // ————————————————————— Đánh giá mức cần thiết —————————————————————

  /**
   * Tính năng lõi: với mỗi danh mục `want`, AI xét **tiền + tần suất + xu hướng** rồi
   * kết luận nên giữ / giảm / cắt (SPEC §4.7).
   */
  async necessityReview(
    userId: string,
    period: 'week' | 'month' = 'week',
    epRange?: { start: Date; end: Date },
  ) {
    const input = await this.thuThapDuLieu(userId, period, epRange);

    if (input.categories.length === 0) {
      throw new BadRequestException(
        'Chưa có giao dịch nào trong kỳ để phân tích. Hãy nhập vài khoản chi trước.',
      );
    }

    return this.sinhInsight({
      userId,
      kind: InsightKind.NECESSITY,
      input,
      range: input.range,
      prompt: buildNecessityPrompt(input),
    });
  }

  /**
   * Báo cáo tổng kết kỳ (tuần/tháng) — nhìn TOÀN CẢNH: dòng tiền, so sánh kỳ trước,
   * ngân sách, mục tiêu, nợ. Khác `necessityReview` chỉ soi từng danh mục chi.
   */
  async periodReport(
    userId: string,
    period: 'week' | 'month' = 'month',
    epRange?: { start: Date; end: Date },
  ) {
    const input = await this.thuThapBaoCao(userId, period, epRange);

    if (input.expense === 0 && input.income === 0) {
      throw new BadRequestException(
        'Kỳ này chưa có giao dịch nào để làm báo cáo. Hãy nhập vài khoản trước.',
      );
    }

    return this.sinhInsight({
      userId,
      kind: period === 'week' ? InsightKind.WEEKLY : InsightKind.MONTHLY,
      input,
      range: input.range,
      prompt: buildPeriodReportPrompt(input),
    });
  }

  async healthScore(userId: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    const range = resolvePeriod('month', {
      timezone: user.timezone,
      monthStartDay: user.monthStartDay,
    });
    const input = await this.thuThapChiSoSucKhoe(userId);

    return this.sinhInsight({
      userId,
      kind: InsightKind.HEALTH_SCORE,
      input,
      // Điểm sức khỏe chấm trên dữ liệu kỳ tháng hiện tại
      range: { start: new Date(range.start.getTime()), end: new Date(range.end.getTime()) },
      prompt: buildHealthScorePrompt(input),
    });
  }

  /** Chỉ đọc từ DB — không gọi API, luôn nhanh và miễn phí */
  async listInsights(
    userId: string,
    opts: { kind?: InsightKind; kinds?: InsightKind[]; limit?: number } = {},
  ) {
    const qb = this.insights
      .createQueryBuilder('i')
      .where('i.userId = :userId', { userId });

    if (opts.kinds?.length) qb.andWhere('i.kind IN (:...kinds)', { kinds: opts.kinds });
    else if (opts.kind) qb.andWhere('i.kind = :kind', { kind: opts.kind });

    // Bản ghi có `periodStart == periodEnd` là RÁC từ thời `periodStart` còn bị lưu bằng
    // `new Date()` (lúc sinh) thay vì kỳ mà báo cáo nói về. Một kỳ thật luôn dài hơn 0 giây.
    // Không xóa dữ liệu của user, chỉ không đem ra hiển thị.
    qb.andWhere('i.periodEnd > i.periodStart');

    // Sắp theo KỲ chứ không theo lúc sinh ra — user muốn xem lịch sử theo dòng thời gian
    // của tiền bạc, không phải theo thứ tự AI chạy
    return qb
      .orderBy('i.periodStart', 'DESC')
      .addOrderBy('i.createdAt', 'DESC')
      .take(opts.limit ?? 20)
      .getMany();
  }

  // ————————————————————— Chat —————————————————————

  async chat(userId: string, message: string, conversationId?: string | null) {
    await this.kiemTraHanMuc(userId);

    const convId = conversationId ?? randomUUID();
    const lichSu = conversationId
      ? await this.chats.find({
          where: { userId, conversationId },
          order: { createdAt: 'ASC' },
          take: 20,
        })
      : [];

    // Đính kèm bối cảnh tài chính đã TỔNG HỢP, không gửi danh sách giao dịch thô
    const boiCanh = await this.thuThapDuLieu(userId, 'month');

    const result = await this.llm.chat([
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        // Chỉ BỐI CẢNH, không kèm chỉ thị JSON — chat phải trả lời bằng câu tự nhiên
        content:
          `Dữ liệu tài chính của người dùng:\n${buildFinancialContext(boiCanh)}\n\n` +
          'Trả lời câu hỏi bằng văn xuôi ngắn gọn, thân thiện. TUYỆT ĐỐI KHÔNG trả về JSON.',
      },
      ...lichSu.map((m) => ({
        role: m.role === ChatRole.USER ? ('user' as const) : ('assistant' as const),
        content: m.content,
      })),
      { role: 'user', content: message },
    ]);

    await this.chats.save([
      this.chats.create({ userId, conversationId: convId, role: ChatRole.USER, content: message }),
      this.chats.create({
        userId,
        conversationId: convId,
        role: ChatRole.ASSISTANT,
        content: result.content,
      }),
    ]);

    return { conversationId: convId, reply: result.content };
  }

  async conversation(userId: string, conversationId: string) {
    return this.chats.find({
      where: { userId, conversationId },
      order: { createdAt: 'ASC' },
    });
  }

  // ————————————————————— Nội bộ —————————————————————

  /**
   * Sinh insight với **cache 2 lớp** theo `inputHash`: Redis (nóng) → Postgres (bền).
   *
   * Dữ liệu chưa đổi thì không gọi lại API — đây là cơ chế chính giữ cho hạn mức free
   * của nhà cung cấp không bị đụng trần. Chỉ khi `force = true` mới bắn thật.
   */
  private async sinhInsight(args: {
    userId: string;
    kind: InsightKind;
    input: unknown;
    /**
     * Khoảng thời gian mà báo cáo NÓI VỀ — không phải lúc sinh ra nó.
     *
     * Trước đây lưu cả hai bằng `new Date()`, khiến bản ghi không cho biết nó là báo cáo
     * của tuần nào. Index `['userId','kind','periodStart']` sinh ra để tra "báo cáo tháng 7
     * đâu rồi" cũng thành vô dụng.
     */
    range: { start: Date; end: Date };
    prompt: string;
    force?: boolean;
  }) {
    const { userId, kind, input, range, prompt, force = false } = args;
    const inputHash = hashInput(input);
    const cacheKey = RedisKeys.aiInsight(userId, kind, inputHash);

    if (!force) {
      const nong = await this.redis.get<Record<string, unknown>>(cacheKey);
      if (nong) return { ...nong, cached: true };

      const ben = await this.insights.findOneBy({ userId, kind, inputHash });
      if (ben) {
        const payload = this.dongGoi(ben);
        await this.redis.set(cacheKey, payload, RedisTtl.AI_INSIGHT);
        return { ...payload, cached: true };
      }
    }

    await this.kiemTraHanMuc(userId);

    const result = await this.llm.chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      {
        jsonMode: true,
        // Số liệu đã tính sẵn ở BE, model chỉ cần diễn giải — không cần nghĩ sâu.
        // Để mặc định thì báo cáo kỳ vượt 60s và bị hủy.
        reasoningEffort: 'low',
        timeoutMs: 120_000,
      },
    );

    let structured: Record<string, unknown> | null = null;
    try {
      structured = JSON.parse(result.content) as Record<string, unknown>;
    } catch {
      // AI trả không đúng JSON — vẫn lưu phần text để user đọc được, chỉ mất phần render card
      this.logger.warn('AI trả về không phải JSON hợp lệ, chỉ lưu dạng text');
    }

    /**
     * GHI ĐÈ theo kỳ, không thêm dòng mới.
     *
     * Một kỳ chỉ được có đúng một báo cáo. Trong kỳ đang chạy, mỗi lần user nhập thêm giao
     * dịch là dữ liệu đổi → bản báo cáo cũ đã lỗi thời, phải bị thay chứ không phải nằm
     * cạnh bản mới. `upsert` để hai request đồng thời không tạo ra bản trùng — khóa duy
     * nhất `(userId, kind, periodStart)` ở DB là chốt chặn cuối.
     */
    await this.insights.upsert(
      {
        userId,
        kind,
        periodStart: range.start,
        periodEnd: range.end,
        inputHash,
        content: result.content,
        structured: structured as never,
        model: result.model,
        tokensUsed: result.tokensUsed,
        /**
         * Bơm tay `updatedAt` — `@UpdateDateColumn` KHÔNG tự chạy trong `upsert`
         * (TypeORM chỉ đưa vào `DO UPDATE SET` những cột có mặt trong object này).
         *
         * Không phải chi tiết trang trí: `AiScheduler` đọc đúng cột này để biết báo cáo
         * được sinh TRƯỚC hay SAU khi kỳ đóng. Bỏ dòng này thì bản ghi ghi đè vẫn mang mốc
         * thời gian cũ, job sẽ tưởng báo cáo còn dang dở và sinh lại MỖI NGÀY — đốt quota.
         */
        updatedAt: new Date(),
      },
      { conflictPaths: ['userId', 'kind', 'periodStart'] },
    );

    const saved = await this.insights.findOneByOrFail({
      userId,
      kind,
      periodStart: range.start,
    });

    const payload = this.dongGoi(saved);
    await this.redis.set(cacheKey, payload, RedisTtl.AI_INSIGHT);
    return { ...payload, cached: false };
  }

  private dongGoi(i: AiInsight) {
    return {
      id: i.id,
      kind: i.kind,
      periodStart: i.periodStart,
      periodEnd: i.periodEnd,
      content: i.content,
      structured: i.structured ?? null,
      model: i.model,
      tokensUsed: i.tokensUsed,
      generatedAt: i.createdAt,
    };
  }

  /**
   * Đếm lượt gọi AI trong ngày.
   *
   * ⚠️ Cố ý **không** suy giảm êm như các thao tác Redis khác: không đếm được mà vẫn cho
   * gọi thì sẽ đốt sạch quota free của nhà cung cấp. Thà chặn còn hơn.
   */
  private async kiemTraHanMuc(userId: string): Promise<void> {
    const hanMuc = this.config.getOrThrow<number>('AI_DAILY_LIMIT');
    const ngay = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const soLuot = await this.redis.incrDaily(
      RedisKeys.aiDailyCount(userId, ngay),
      RedisTtl.AI_DAILY,
    );

    if (soLuot > hanMuc) {
      throw new HttpException(
        `Đã dùng hết ${hanMuc} lượt AI trong ngày hôm nay. Thử lại vào ngày mai.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Gom dữ liệu ĐÃ TỔNG HỢP cho prompt — không bao giờ gửi danh sách giao dịch thô */
  private async thuThapDuLieu(
    userId: string,
    period: 'week' | 'month',
    epRange?: { start: Date; end: Date },
  ): Promise<NecessityInput & { range: { start: Date; end: Date } }> {
    const user = await this.users.findOneByOrFail({ id: userId });
    const range =
      epRange ??
      resolvePeriod(period, {
        timezone: user.timezone,
        monthStartDay: user.monthStartDay,
      });

    // Kỳ ép từ ngoài (job chạy cho kỳ ĐÃ ĐÓNG) thì truyền from/to; kỳ hiện tại thì
    // để stats tự tính theo monthStartDay
    const q = epRange
      ? { from: epRange.start, to: epRange.end, periodKind: period }
      : { period };

    const [summary, categories, goals] = await Promise.all([
      this.stats.getSummary(userId, q as never),
      this.stats.getByCategory(userId, { ...q, type: TxType.EXPENSE } as never),
      this.goals.find({ where: { userId, status: GoalStatus.ACTIVE } }),
    ]);

    return {
      range: { start: new Date(range.start.getTime()), end: new Date(range.end.getTime()) },
      periodLabel: `${range.start.toISOString().slice(0, 10)} → ${range.end.toISOString().slice(0, 10)}`,
      income: summary.income,
      expense: summary.expense,
      monthlyIncome: user.monthlyIncome ?? null,
      byKind: summary.byKind,
      categories,
      goals: goals.map((g) => ({
        name: g.name,
        monthlyTarget: g.monthlyContribution ?? 0,
      })),
      daysOfData: Math.ceil(
        (range.end.getTime() - range.start.getTime()) / (24 * 3600 * 1000),
      ),
    };
  }

  /** Gom dữ liệu toàn cảnh cho báo cáo kỳ — nhiều hơn `necessity` vì cần cả ngân sách/mục tiêu/nợ */
  private async thuThapBaoCao(
    userId: string,
    period: 'week' | 'month',
    epRange?: { start: Date; end: Date },
  ): Promise<PeriodReportInput & { range: { start: Date; end: Date } }> {
    const q = epRange
      ? { from: epRange.start, to: epRange.end, periodKind: period }
      : { period };

    const [coBan, summary, budgets, goals, debts] = await Promise.all([
      this.thuThapDuLieu(userId, period, epRange),
      this.stats.getSummary(userId, q as never),
      this.budgets.findAllWithProgress(userId),
      this.goalsService.findAll(userId, { status: GoalStatus.ACTIVE }),
      this.debts.find({ where: { userId, isPaid: false } }),
    ]);

    const daNap = await this.goalsService.contributedThisPeriod(
      userId,
      goals.map((g) => g.id),
    );

    return {
      ...coBan,
      previousExpense: summary.comparison.previousPeriodExpense,
      changePercent: summary.comparison.changePercent,
      budgets: budgets.map(({ budget, calc }) => ({
        name: budget.category?.name ?? 'Toàn bộ chi tiêu',
        spent: calc.spent,
        limit: budget.amount + calc.rolloverIn,
        status:
          calc.spent > budget.amount + calc.rolloverIn
            ? 'đã vượt'
            : calc.spent / (budget.amount + calc.rolloverIn) >= 0.7
              ? 'sắp chạm hạn mức'
              : 'trong hạn mức',
      })),
      goals: goals.map((g) => ({
        name: g.name,
        monthlyTarget: g.monthlyContribution ?? 0,
        progress: g.targetAmount > 0 ? g.currentAmount / g.targetAmount : 0,
        contributedThisPeriod: daNap.get(g.id) ?? 0,
      })),
      debts: debts.map((d) => ({
        name: d.name,
        remaining: d.remaining,
        interestRate: d.interestRate,
      })),
    };
  }

  private async thuThapChiSoSucKhoe(userId: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    const [summary, balance, debts] = await Promise.all([
      this.stats.getSummary(userId, { period: 'month' }),
      this.stats.getBalance(userId),
      this.debts.find({ where: { userId, isPaid: false } }),
    ]);

    const tongNo = debts.reduce((s, d) => s + d.remaining, 0);

    return {
      savingRate:
        summary.income > 0
          ? Number(((summary.income - summary.expense) / summary.income).toFixed(4))
          : 0,
      budgetAdherence: null,
      // Quỹ dự phòng = số tiền hiện có đủ sống mấy tháng theo mức chi hiện tại
      emergencyMonths:
        summary.expense > 0
          ? Number((balance.currentBalance / summary.expense).toFixed(2))
          : null,
      debtToIncome:
        user.monthlyIncome && user.monthlyIncome > 0 && tongNo > 0
          ? Number((tongNo / (user.monthlyIncome * 12)).toFixed(4))
          : null,
      monthlyIncome: user.monthlyIncome ?? null,
    };
  }
}
