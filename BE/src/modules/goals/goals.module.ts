import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsModule } from '../transactions/transactions.module';
import { User } from '../users/entities/user.entity';
import { GoalContribution } from './entities/goal-contribution.entity';
import { Goal } from './entities/goal.entity';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

@Module({
  // Cần TransactionsService.getBalance() để chặn nạp vượt số tiền đang có
  imports: [TypeOrmModule.forFeature([Goal, GoalContribution, User]), TransactionsModule],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}
