import { Controller, Get, Query } from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  ByCategoryQuery,
  CalendarQuery,
  RangeQuery,
  TrendQuery,
  byCategoryQuerySchema,
  calendarQuerySchema,
  rangeQuerySchema,
  trendQuerySchema,
} from './dto/stats.dto';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('balance')
  balance(@CurrentUser() user: AuthUser) {
    return this.stats.getBalance(user.id);
  }

  @Get('summary')
  summary(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(rangeQuerySchema)) query: RangeQuery,
  ) {
    return this.stats.getSummary(user.id, query);
  }

  /** Nguồn dữ liệu chính cho AI — trả cả tần suất, không chỉ tổng tiền */
  @Get('by-category')
  byCategory(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(byCategoryQuerySchema)) query: ByCategoryQuery,
  ) {
    return this.stats.getByCategory(user.id, query);
  }

  @Get('trend')
  trend(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(trendQuerySchema)) query: TrendQuery,
  ) {
    return this.stats.getTrend(user.id, query);
  }

  @Get('calendar')
  calendar(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(calendarQuerySchema)) query: CalendarQuery,
  ) {
    return this.stats.getCalendar(user.id, query.month);
  }
}
