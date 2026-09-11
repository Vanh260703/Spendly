import {
  Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DebtsService } from './debts.service';
import {
  CreateDebtDto, PayDebtDto, PayoffPlanQuery, UpdateDebtDto,
  createDebtSchema, payDebtSchema, payoffPlanQuerySchema, toDebtDto, updateDebtSchema,
} from './dto/debt.dto';

@Controller('debts')
export class DebtsController {
  constructor(private readonly debts: DebtsService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthUser, @Query('includePaid') includePaid?: string) {
    return (await this.debts.findAll(user.id, includePaid === 'true')).map(toDebtDto);
  }

  /** Đặt TRƯỚC `:id` để "payoff-plan" không bị khớp vào tham số id */
  @Get('payoff-plan')
  payoffPlan(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(payoffPlanQuerySchema)) query: PayoffPlanQuery,
  ) {
    return this.debts.payoffPlan(user.id, query.strategy, query.extraPayment);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createDebtSchema)) dto: CreateDebtDto,
  ) {
    return toDebtDto(await this.debts.create(user.id, dto));
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return toDebtDto(await this.debts.findOne(user.id, id));
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateDebtSchema)) dto: UpdateDebtDto,
  ) {
    return toDebtDto(await this.debts.update(user.id, id, dto));
  }

  @Post(':id/payment')
  async pay(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(payDebtSchema)) dto: PayDebtDto,
  ) {
    return toDebtDto(await this.debts.pay(user.id, id, dto));
  }

  @Get(':id/payments')
  payments(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.debts.paymentHistory(user.id, id);
  }
}
