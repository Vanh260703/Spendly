import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  ListCategoryQuery,
  UpdateCategoryDto,
  createCategorySchema,
  listCategoryQuerySchema,
  toCategoryDto,
  updateCategorySchema,
} from './dto/category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listCategoryQuerySchema)) query: ListCategoryQuery,
  ) {
    return (await this.categories.findAll(user.id, query)).map(toCategoryDto);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCategorySchema)) dto: CreateCategoryDto,
  ) {
    return toCategoryDto(await this.categories.create(user.id, dto));
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) dto: UpdateCategoryDto,
  ) {
    return toCategoryDto(await this.categories.update(user.id, id, dto));
  }
  /** Trả về số giao dịch đã chuyển sang "Khác", để FE báo cho user biết chuyện gì đã xảy ra. */
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(user.id, id);
  }
}
