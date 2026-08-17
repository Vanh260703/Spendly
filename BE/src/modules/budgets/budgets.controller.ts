import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BudgetsService } from './budgets.service';
import {
  BudgetHistoryQuery, CreateBudgetDto, UpdateBudgetDto,
  budgetHistoryQuerySchema, createBudgetSchema, toBudgetDto,
  toBudgetHistoryDto, updateBudgetSchema,
} from './dto/budget.dto';

@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthUser) {
    const rows = await this.budgets.findAllWithProgress(user.id);
    return rows.map(({ budget, calc }) => toBudgetDto(budget, calc));
  }

  /** Đặt TRƯỚC `:id` — nếu không "history" sẽ khớp vào `:id` và ParseUUIDPipe ném 400 */
  @Get('history')
  async history(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(budgetHistoryQuerySchema)) query: BudgetHistoryQuery,
  ) {
    return (await this.budgets.history(user.id, query)).map(toBudgetHistoryDto);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createBudgetSchema)) dto: CreateBudgetDto,
  ) {
    const b = await this.budgets.create(user.id, dto);
    const full = await this.budgets.findAllWithProgress(user.id);
    const found = full.find((x) => x.budget.id === b.id)!;
    return toBudgetDto(found.budget, found.calc);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateBudgetSchema)) dto: UpdateBudgetDto,
  ) {
    await this.budgets.update(user.id, id, dto);
    const full = await this.budgets.findAllWithProgress(user.id);
    const found = full.find((x) => x.budget.id === id);
    return found ? toBudgetDto(found.budget, found.calc) : null;
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.budgets.remove(user.id, id);
  }
}
