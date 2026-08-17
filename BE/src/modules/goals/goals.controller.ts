import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  ContributeDto, CreateGoalDto, ListGoalQuery, UpdateGoalDto,
  contributeSchema, createGoalSchema, listGoalQuerySchema, toGoalDto, updateGoalSchema,
} from './dto/goal.dto';
import { GoalsService } from './goals.service';

@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listGoalQuerySchema)) query: ListGoalQuery,
  ) {
    const goals = await this.goals.findAll(user.id, query);
    const daNap = await this.goals.contributedThisPeriod(
      user.id,
      goals.map((g) => g.id),
    );
    return goals.map((g) =>
      toGoalDto(g, { contributedThisPeriod: daNap.get(g.id) ?? 0 }),
    );
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createGoalSchema)) dto: CreateGoalDto,
  ) {
    return toGoalDto(await this.goals.create(user.id, dto));
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const goal = await this.goals.findOne(user.id, id);
    const daNap = await this.goals.contributedThisPeriod(user.id, [id]);
    return toGoalDto(goal, { contributedThisPeriod: daNap.get(id) ?? 0 });
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateGoalSchema)) dto: UpdateGoalDto,
  ) {
    return toGoalDto(await this.goals.update(user.id, id, dto));
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.goals.remove(user.id, id);
  }

  @Post(':id/contribute')
  async contribute(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(contributeSchema)) dto: ContributeDto,
  ) {
    return toGoalDto(await this.goals.contribute(user.id, id, dto));
  }

  @Get(':id/contributions')
  contributions(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.goals.contributions_(user.id, id);
  }
}
