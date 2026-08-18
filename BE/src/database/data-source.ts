import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

loadEnv();

/**
 * Cấu hình DataSource dùng chung cho cả app (AppModule) và TypeORM CLI (migration).
 *
 * ⚠️ `synchronize: false` ở MỌI môi trường — mọi thay đổi schema phải đi qua migration
 * đã commit. Xem SPEC.md §7.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'spendly',
  password: process.env.DB_PASSWORD ?? 'spendly',
  database: process.env.DB_NAME ?? 'spendly',

  /**
   * TLS — bật bằng `DB_SSL=true` (xem `config/env.ts`). Bắt buộc với Neon và mọi Postgres
   * quản lý; phải TẮT với Postgres local. Lưu ý bản Ubuntu/Debian **có** phục vụ TLS bằng
   * chứng chỉ tự ký, nên bật nhầm sẽ chết với `Error: self-signed certificate` chứ không
   * phải một lỗi nói rõ là do TLS.
   *
   * ⚠️ **`rejectUnauthorized: true` là CỐ Ý, đừng đổi thành `false`.** Hầu hết hướng dẫn trên
   * mạng để `false` cho hết báo lỗi, nhưng thế là tắt việc xác minh chứng chỉ: kết nối vẫn
   * được mã hóa mà không còn kiểm tra đầu bên kia có đúng là máy chủ mình định nối tới hay
   * không — mở đường cho tấn công xen giữa. Neon dùng chứng chỉ do CA công cộng cấp nên xác
   * minh chạy bình thường, không cần tắt gì cả.
   *
   * Đọc thẳng `process.env` thay vì qua `ConfigService` là có chủ ý: file này còn được
   * TypeORM CLI nạp lúc chạy migration, khi chưa có container nào của Nest tồn tại.
   */
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,

  /**
   * Channel binding (SCRAM-SHA-256-PLUS) — chống tấn công xen giữa ở tầng xác thực.
   *
   * Chuỗi kết nối Neon có `channel_binding=require`, nhưng đó là tham số của **libpq**
   * (psql, các driver dựa trên libpq). Ở đây ta truyền từng tùy chọn rời cho `pg` nên tham
   * số ấy đơn giản là không tồn tại — phải bật bằng cờ riêng, nếu không sẽ mất lớp bảo vệ
   * đó mà **không có cảnh báo nào**.
   *
   * An toàn khi bật: `pg` chỉ dùng SCRAM-SHA-256-PLUS *khi máy chủ có mời*, không mời thì tự
   * lùi về SCRAM-SHA-256 thường (xem `pg/lib/client.js`). Dù vậy vẫn buộc theo `DB_SSL` cho
   * đúng ngữ nghĩa: channel binding chỉ có ý nghĩa trên kết nối TLS.
   */
  extra:
    process.env.DB_SSL === 'true' ? { enableChannelBinding: true } : undefined,

  // Dùng glob để CLI (chạy .ts) và app đã build (chạy .js) đều tìm được
  entities: [__dirname + '/../modules/**/entities/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],

  synchronize: false,
  migrationsRun: false,
  // Tắt hẳn khi test: nhiều test CỐ Ý gây lỗi DB (trùng email, vi phạm khóa ngoại),
  // log ra sẽ lấp mất kết quả test thật.
  logging:
    process.env.NODE_ENV === 'test'
      ? false
      : process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
};

/** Instance dành riêng cho TypeORM CLI (`npm run migration:generate`) */
export default new DataSource(dataSourceOptions);
