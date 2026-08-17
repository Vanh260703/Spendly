import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../categories/entities/category.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { Transaction } from './entities/transaction.entity';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Category, Wallet])],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  // Stats sẽ dùng lại getBalance() khi làm GET /stats/balance
  exports: [TransactionsService],
})
export class TransactionsModule {}
