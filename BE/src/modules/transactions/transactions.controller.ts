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
  AdjustBalanceDto,
  CreateTransactionDto,
  ListTransactionQuery,
  UpdateTransactionDto,
  adjustBalanceSchema,
  createTransactionSchema,
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

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createTransactionSchema)) dto: CreateTransactionDto,
  ) {
    return toTransactionDto(await this.transactions.create(user.id, dto));
  }

  /**
   * Đặt TRƯỚC `:id` — nếu không, Nest sẽ khớp "adjust-balance" vào `:id`
   * và `ParseUUIDPipe` ném 400.
   */
  @Post('adjust-balance')
  async adjustBalance(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(adjustBalanceSchema)) dto: AdjustBalanceDto,
  ) {
    const kq = await this.transactions.adjustBalance(user.id, dto);
    return {
      ...kq,
      transaction: kq.transaction ? toTransactionDto(kq.transaction) : null,
    };
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
