import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../categories/entities/category.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { User } from '../users/entities/user.entity';
import { BudgetsController } from './budgets.controller';
import { BudgetsScheduler } from './budgets.scheduler';
import { BudgetsService } from './budgets.service';
import { BudgetPeriodResult } from './entities/budget-period-result.entity';
import { Budget } from './entities/budget.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Budget, BudgetPeriodResult, Transaction, Category, User]),
  ],
  controllers: [BudgetsController],
  providers: [BudgetsService, BudgetsScheduler],
  exports: [BudgetsService],
})
export class BudgetsModule {}
