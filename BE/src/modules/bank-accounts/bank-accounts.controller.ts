import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post,
} from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  LinkBankAccountDto, UpdateBankAccountDto,
  linkBankAccountSchema, toBankAccountDto, updateBankAccountSchema,
} from './dto/bank-account.dto';
import { BankAccountsService } from './bank-accounts.service';

/**
 * Tài khoản ngân hàng — **chỉ đọc**.
 *
 * Liên kết khai trong `.env` (`BANK_ACCOUNT_NUMBER`) và `SingleUserService` dựng lúc khởi
 * động. Không có endpoint tạo/sửa/xóa: một người, một tài khoản, giá trị gần như không đổi
 * — dựng cả CRUD cho nó là thừa.
 */
@Controller('bank-accounts')
export class BankAccountsController {
  constructor(private readonly service: BankAccountsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return (await this.service.findAll(user.id)).map(toBankAccountDto);
  }



}
