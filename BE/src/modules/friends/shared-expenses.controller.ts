import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateSettlementDto,
  CreateSharedExpenseDto,
  ListSharedExpensesDto,
  createSettlementSchema,
  createSharedExpenseSchema,
  listSharedExpensesSchema,
} from './dto/friends.dto';
import { FriendsService } from './friends.service';

/** Chia bill — ghi những lần trả hộ / được trả hộ */
@Controller('shared-expenses')
export class SharedExpensesController {
  constructor(private readonly service: FriendsService) {}

  @Get()
  list(
    @CurrentUser('id') userId: string,
    @Query(new ZodValidationPipe(listSharedExpensesSchema)) query: ListSharedExpensesDto,
  ) {
    return this.service.listSharedExpenses(userId, query);
  }

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(createSharedExpenseSchema)) dto: CreateSharedExpenseDto,
  ) {
    return this.service.createSharedExpense(userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteSharedExpense(userId, id);
  }
}

/** Tất toán — trả lại tiền đã mượn/cho mượn */
@Controller('settlements')
export class SettlementsController {
  constructor(private readonly service: FriendsService) {}

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(createSettlementSchema)) dto: CreateSettlementDto,
  ) {
    return this.service.createSettlement(userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteSettlement(userId, id);
  }
}
