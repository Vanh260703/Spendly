import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../categories/entities/category.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { ContactsController } from './contacts.controller';
import { Contact } from './entities/contact.entity';
import { Settlement } from './entities/settlement.entity';
import { SharedExpense, SharedExpenseShare } from './entities/shared-expense.entity';
import { FriendsService } from './friends.service';
import {
  SettlementsController,
  SharedExpensesController,
} from './shared-expenses.controller';

/**
 * Danh bạ + công nợ bạn bè.
 *
 * Cố ý gộp CHUNG một module dù có 3 nhóm endpoint: tách `contacts/` ra riêng sẽ thành phụ
 * thuộc vòng — trang Danh bạ cần số công nợ (→ shared-expenses), mà shared-expenses cần tên
 * người (→ contacts). NestJS chỉ báo lỗi vòng lúc runtime nên rất khó lần ra.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Contact,
      SharedExpense,
      SharedExpenseShare,
      Settlement,
      Category,
      Wallet,
    ]),
  ],
  controllers: [ContactsController, SharedExpensesController, SettlementsController],
  providers: [FriendsService],
  exports: [FriendsService],
})
export class FriendsModule {}
