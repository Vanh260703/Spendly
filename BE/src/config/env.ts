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
   * Bật TLS cho kết nối Postgres. Mặc định TẮT.
   *
   * Postgres quản lý (Neon, Supabase, Railway…) **chỉ** nhận kết nối TLS. Với Postgres local
   * thì phải TẮT, nhưng lý do khác nhau tùy bản: image Docker và bản Homebrew không bật TLS,
   * còn bản đóng gói của Ubuntu/Debian **có** bật sẵn — bằng một chứng chỉ **tự ký**, nên
   * xác minh sẽ trượt. Cả hai trường hợp đều để `false`.
   *
   * Triệu chứng khi bật nhầm với Postgres local trên Ubuntu: app không boot được, log lặp
   * `Unable to connect to the database. Retrying…` kèm `Error: self-signed certificate` —
   * câu này không hề nhắc tới `DB_SSL` nên rất dễ đi tìm sai chỗ.
   *
   * ⚠️ **Cố ý KHÔNG dùng `z.coerce.boolean()`.** `Boolean("false")` trong JavaScript trả về
   * `true` (chuỗi không rỗng là truthy), nên khai `DB_SSL=false` sẽ bị hiểu ngược thành BẬT,
   * và Postgres local không kết nối nổi với một lỗi chẳng liên quan gì tới SSL. Phải so
   * chuỗi tường minh. Lưu ý `z.coerce.number()` ở trên KHÔNG dính lỗi này — chỉ boolean mới bị.
   */
  DB_SSL: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive(),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET phải dài ít nhất 16 ký tự'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET phải dài ít nhất 16 ký tự'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  /**
   * LLM — dùng giao thức OpenAI-compatible nên đổi nhà cung cấp chỉ là sửa 3 biến này.
   * Để trống `LLM_API_KEY` thì app vẫn chạy bình thường, chỉ là tính năng AI báo
   * "chưa sẵn sàng" thay vì làm sập màn hình.
   */
  LLM_PROVIDER: z.string().default('Gemini'),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z
    .string()
    .url()
    .default('https://generativelanguage.googleapis.com/v1beta/openai'),
  LLM_MODEL: z.string().default('gemini-flash-lite-latest'),
  AI_DAILY_LIMIT: z.coerce.number().int().positive().default(30),

  /**
   * Cloudinary — nơi lưu ảnh QR chuyển tiền của người trong danh bạ.
   *
   * Cả ba đều `optional()` theo đúng cách đã làm với `LLM_API_KEY`: thiếu thì app vẫn boot
   * bình thường, chỉ riêng endpoint xin chữ ký trả 503 kèm lời nhắn rõ phải làm gì. Bắt buộc
   * ở đây sẽ khiến máy chưa cấu hình Cloudinary không chạy nổi cả những phần không liên quan.
   *
   * ⚠️ `CLOUDINARY_API_SECRET` CHỈ được nằm ở BE — FE không bao giờ thấy nó, chữ ký do BE cấp.
   */
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
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
