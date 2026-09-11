import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FriendsModule } from '../friends/friends.module';
import { Goal } from '../goals/entities/goal.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { TransactionsModule } from '../transactions/transactions.module';
import { User } from '../users/entities/user.entity';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  // Dùng lại TransactionsService.getBalance() thay vì viết lại công thức số dư —
  // hai chỗ tính khác nhau là sớm muộn cũng lệch
  imports: [
    TypeOrmModule.forFeature([Transaction, User, Goal]),
    TransactionsModule,
    FriendsModule,
  ],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
