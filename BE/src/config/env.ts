import { z } from 'zod';

/**
 * Schema của toàn bộ biến môi trường.
 *
 * Validate ngay lúc khởi động: thiếu hoặc sai biến thì app chết luôn kèm thông báo rõ ràng,
 * thay vì chạy được rồi mới lỗi lúc nửa đêm khi job chạy.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive(),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),

  /**
   * LLM — dùng giao thức OpenAI-compatible nên đổi nhà cung cấp chỉ là sửa 3 biến này.
   * Để trống `LLM_API_KEY` thì app vẫn chạy bình thường, chỉ là tính năng AI báo
   * "chưa sẵn sàng" thay vì làm sập màn hình.
   *
   * ⚠️ Cố ý KHÔNG có `AI_DAILY_LIMIT`/hạn mức gọi/ngày — bản trước dùng Redis để đếm, nhưng
   * cơ chế chặn gọi trùng THẬT SỰ nằm ở Postgres (`ai_insights` khóa theo `inputHash`, xem
   * `AiService.sinhInsight()`): dữ liệu chưa đổi thì không gọi lại LLM dù có đếm lượt hay
   * không. Đếm lượt/ngày chỉ là một lớp chặn THÊM, và người dùng chọn tự quản lý việc đó —
   * thêm Redis chỉ để đếm là cõng cả một service cho một việc không ai dùng tới.
   */
  LLM_PROVIDER: z.string().default('Gemini'),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z
    .string()
    .url()
    .default('https://generativelanguage.googleapis.com/v1beta/openai'),
  LLM_MODEL: z.string().default('gemini-flash-lite-latest'),

  /**
   * ─── TÀI KHOẢN NGÂN HÀNG ───
   *
   * Khai ở đây thay vì làm màn hình onboarding: app phục vụ một người, một tài khoản, và
   * số này gần như không bao giờ đổi. Bắt dựng cả một luồng UI cho một giá trị cố định là
   * thừa — mà mỗi màn hình thừa lại là một chỗ có thể hỏng.
   *
   * ⚠️ Phải khớp CHÍNH XÁC `accountNumber` SePay gửi trong webhook, nếu không giao dịch về
   * mà không tra ra chủ và sẽ bị bỏ qua (vẫn ghi vào `sepay_webhook_logs`).
   */
  BANK_ACCOUNT_NUMBER: z.string().min(4, 'Số tài khoản quá ngắn'),
  BANK_NAME: z.string().default('Ngân hàng'),

  /** Múi giờ dùng cho mọi phép tính kỳ — đừng đổi trừ khi chuyển nước */
  TIMEZONE: z.string().default('Asia/Ho_Chi_Minh'),
  /** Ngày bắt đầu chu kỳ tháng (1–28), VD 25 = "tháng" chạy từ 25 tới 24 tháng sau */
  MONTH_START_DAY: z.coerce.number().int().min(1).max(28).default(1),

  /**
   * Thu nhập hàng tháng ước tính (đồng) — AI dùng để quy đổi "khoản này chiếm bao nhiêu %
   * thu nhập". Để trống thì AI vẫn chạy, chỉ bỏ qua phần quy đổi đó.
   */
  /**
   * ⚠️ Để trống trong `.env` thì biến này là CHUỖI RỖNG, không phải `undefined` — và
   * `z.coerce.number()` biến `""` thành `0`, `positive()` từ chối `0` → app chết lúc boot
   * dù người dùng chỉ đang "để trống" đúng như tài liệu bảo. `preprocess` chặn trường hợp
   * đó trước khi coerce chạy.
   */
  MONTHLY_INCOME: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),

  /**
   * ─── SePay API (KÉO giao dịch về) ───
   *
   * Đây là nguồn dữ liệu DUY NHẤT. App chủ động gọi sang SePay theo chu kỳ, không còn chờ
   * SePay gọi vào — nhờ vậy app không cần lộ ra Internet.
   *
   * ⚠️ Token này **toàn quyền**: SePay chưa hỗ trợ phân quyền cho API, ai cầm được nó là
   * đọc được mọi giao dịch của mọi tài khoản. Không commit, không để lộ ra FE.
   *
   * Để TRỐNG thì app vẫn chạy, chỉ là không đồng bộ được — hợp lý khi dựng thử máy khác.
   */
  SEPAY_API_URL: z.string().url().default('https://my.sepay.vn'),
  SEPAY_API_TOKEN: z.string().optional(),

});

export type Env = z.infer<typeof envSchema>;

/** Dùng làm `validate` cho ConfigModule.forRoot() */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const chiTiet = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Biến môi trường không hợp lệ:\n${chiTiet}`);
  }

  return parsed.data;
}
