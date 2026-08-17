import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Debt } from '../debts/entities/debt.entity';
import { Goal } from '../goals/entities/goal.entity';
import { BudgetsModule } from '../budgets/budgets.module';
import { GoalsModule } from '../goals/goals.module';
import { StatsModule } from '../stats/stats.module';
import { User } from '../users/entities/user.entity';
import { AiController } from './ai.controller';
import { AiScheduler } from './ai.scheduler';
import { AiService } from './ai.service';
import { AiInsight } from './entities/ai-insight.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { LlmClient } from './llm.client';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiInsight, ChatMessage, User, Goal, Debt]),
    StatsModule,
    BudgetsModule,
    GoalsModule,
  ],
  controllers: [AiController],
  providers: [AiService, AiScheduler, LlmClient],
  exports: [AiService],
})
export class AiModule {}
