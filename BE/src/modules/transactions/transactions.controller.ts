import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  ListTransactionQuery,
  UpdateTransactionDto,
  listTransactionQuerySchema,
  toTransactionDto,
  updateTransactionSchema,
} from './dto/transaction.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listTransactionQuerySchema))
    query: ListTransactionQuery,
  ) {
    const { items, nextCursor } = await this.transactions.findAll(user.id, query);
    return { items: items.map(toTransactionDto), nextCursor };
  }

  /*
   * ⚠️ KHÔNG có `POST /transactions`.
   *
   * Giao dịch chỉ đến từ HAI nguồn: webhook SePay, và việc tách một giao dịch ngân hàng khi
   * chia bill. Cho nhập tay thì số dư app tự tính sẽ lệch khỏi số dư ngân hàng báo về, mà
   * ngân hàng mới là nguồn sự thật.
   *
   * `POST /transactions/adjust-balance` cũng bỏ vì lý do tương tự: `accumulated` của webhook
   * đã là số dư thật, không có gì để "điều chỉnh".
   */

  /**
   * Đặt TRƯỚC `:id` — nếu không Nest sẽ khớp "unreviewed-count" vào `:id` và
   * `ParseUUIDPipe` ném 400.
   */
  @Get('unreviewed-count')
  demChuaXet(@CurrentUser('id') userId: string) {
    return this.transactions.demChuaXet(userId).then((count) => ({ count }));
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return toTransactionDto(await this.transactions.findOne(user.id, id));
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTransactionSchema)) dto: UpdateTransactionDto,
  ) {
    return toTransactionDto(await this.transactions.update(user.id, id, dto));
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactions.remove(user.id, id);
  }
}
