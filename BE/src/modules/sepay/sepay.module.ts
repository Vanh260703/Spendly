import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { Category } from '../categories/entities/category.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { SepayApiClient } from './sepay-api.client';
import { SepayController } from './sepay.controller';
import { SepaySyncService } from './sepay-sync.service';

/** Kéo giao dịch từ SePay về — nguồn dữ liệu duy nhất của app */
@Module({
  imports: [TypeOrmModule.forFeature([BankAccount, Category, Transaction])],
  controllers: [SepayController],
  providers: [SepayApiClient, SepaySyncService],
  exports: [SepaySyncService],
})
export class SepayModule {}
