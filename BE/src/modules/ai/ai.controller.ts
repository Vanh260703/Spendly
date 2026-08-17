import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AiService } from './ai.service';
import {
  ChatDto, GenerateInsightDto, ListInsightQuery, NecessityQuery,
  chatSchema, generateInsightSchema, listInsightQuerySchema, necessityQuerySchema,
} from './dto/ai.dto';
import { InsightKind } from './entities/ai-insight.entity';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  /** Tính năng lõi: đánh giá mức cần thiết + gợi ý cắt giảm */
  @Get('necessity-review')
  necessityReview(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(necessityQuerySchema)) query: NecessityQuery,
  ) {
    return this.ai.necessityReview(user.id, query.period);
  }

  /** Báo cáo tổng kết kỳ — tóm tắt · điểm nổi bật · cảnh báo · 3 việc nên làm */
  @Get('report')
  report(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(necessityQuerySchema)) query: NecessityQuery,
  ) {
    return this.ai.periodReport(user.id, query.period);
  }

  @Get('health-score')
  healthScore(@CurrentUser() user: AuthUser) {
    return this.ai.healthScore(user.id);
  }

  @Get('insights')
  listInsights(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listInsightQuerySchema)) query: ListInsightQuery,
  ) {
    return this.ai.listInsights(user.id, query);
  }

  @Post('insights/generate')
  generate(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(generateInsightSchema)) dto: GenerateInsightDto,
  ) {
    switch (dto.kind) {
      case InsightKind.HEALTH_SCORE:
        return this.ai.healthScore(user.id);
      case InsightKind.WEEKLY:
        return this.ai.periodReport(user.id, 'week');
      case InsightKind.MONTHLY:
        return this.ai.periodReport(user.id, 'month');
      default:
        return this.ai.necessityReview(user.id, dto.period);
    }
  }

  @Post('chat')
  chat(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(chatSchema)) dto: ChatDto,
  ) {
    return this.ai.chat(user.id, dto.message, dto.conversationId);
  }

  @Get('chat/:conversationId')
  conversation(
    @CurrentUser() user: AuthUser,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ) {
    return this.ai.conversation(user.id, conversationId);
  }
}
