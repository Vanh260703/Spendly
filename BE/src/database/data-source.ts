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
