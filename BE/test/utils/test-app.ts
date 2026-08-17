import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';

export interface TestContext {
  app: INestApplication;
  dataSource: DataSource;
  /** Địa chỉ HTTP để supertest gọi vào */
  server: unknown;
}

/**
 * Dựng app thật (Postgres + Redis thật) cho test e2e.
 *
 * Cố ý **không mock DB/Redis**: những lỗi đắt nhất của dự án này đều nằm ở ranh giới với
 * hạ tầng — `bigint` trả về string, TypeORM không suy được kiểu cột nullable, Redis chết
 * làm gãy đăng ký. Mock đi thì test xanh mà app vẫn hỏng.
 *
 * Chạy trên DB riêng `spendly_test` (xem `.env.test`) nên không đụng dữ liệu dev.
 */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  // Tắt logger: nhiều test cố ý gây lỗi (trùng email, Redis chết), log sẽ lấp kết quả test
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();

  return {
    app,
    dataSource: app.get(DataSource),
    server: app.getHttpServer(),
  };
}

/** Xóa sạch dữ liệu giữa các file test. `CASCADE` lo phần khóa ngoại. */
export async function truncateAll(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'TRUNCATE TABLE users, categories, wallets, transactions, budgets, budget_period_results, goals, goal_contributions, debts, debt_payments, ai_insights, chat_messages RESTART IDENTITY CASCADE',
  );
}

/** Email không trùng nhau giữa các test chạy song song hoặc chạy lại */
export function uniqueEmail(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@spendly.test`;
}
