import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { CategoriesModule } from '../categories/categories.module';
import { SingleUserService } from './single-user.service';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, BankAccount]), CategoriesModule],
  controllers: [UsersController],
  providers: [UsersService, SingleUserService],
  exports: [UsersService, SingleUserService],
})
export class UsersModule {}
