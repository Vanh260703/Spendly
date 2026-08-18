import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { validateEnv } from './config/env';
import { dataSourceOptions } from './database/data-source';
import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { DebtsModule } from './modules/debts/debts.module';
import { ExportModule } from './modules/export/export.module';
import { FriendsModule } from './modules/friends/friends.module';
import { GoalsModule } from './modules/goals/goals.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { StatsModule } from './modules/stats/stats.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { UsersModule } from './modules/users/users.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { CloudinaryModule } from './shared/cloudinary';
import { RedisModule } from './shared/redis';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Validate biến môi trường ngay lúc boot — thiếu/sai là app chết luôn kèm thông báo rõ
      validate: validateEnv,
    }),
    TypeOrmModule.forRoot(dataSourceOptions),
    RedisModule,
    CloudinaryModule,
    // Cron chốt kỳ ngân sách hằng ngày
    ScheduleModule.forRoot(),

    // Domain modules
    AuthModule,
    UsersModule,
    WalletsModule,
    CategoriesModule,
    TransactionsModule,
    StatsModule,
    BudgetsModule,
    GoalsModule,
    FriendsModule,
    DebtsModule,
    AiModule,
    ExportModule,
    UploadsModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
