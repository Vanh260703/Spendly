import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { validateEnv } from './config/env';
import { dataSourceOptions } from './database/data-source';
import { ExportModule } from './modules/export/export.module';
import { FriendsModule } from './modules/friends/friends.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { SepayModule } from './modules/sepay/sepay.module';
import { StatsModule } from './modules/stats/stats.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { UsersModule } from './modules/users/users.module';
import { BankAccountsModule } from './modules/bank-accounts/bank-accounts.module';
import { AiModule } from './modules/ai/ai.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { DebtsModule } from './modules/debts/debts.module';
import { GoalsModule } from './modules/goals/goals.module';
import { SingleUserGuard } from './common/guards/single-user.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Validate biến môi trường ngay lúc boot — thiếu/sai là app chết luôn kèm thông báo rõ
      validate: validateEnv,
    }),
    TypeOrmModule.forRoot(dataSourceOptions),
    // Cron chốt kỳ ngân sách hằng ngày
    ScheduleModule.forRoot(),

    // Domain modules
    UsersModule,
    BankAccountsModule,
    CategoriesModule,
    TransactionsModule,
    StatsModule,
    FriendsModule,
    SepayModule,
    ExportModule,
    BudgetsModule,
    GoalsModule,
    DebtsModule,
    AiModule,
  ],
  providers: [
    // Thay cho JwtAuthGuard: không chặn ai, chỉ gắn user duy nhất vào request
    { provide: APP_GUARD, useClass: SingleUserGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
