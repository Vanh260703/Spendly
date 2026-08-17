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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateContactDto,
  ListContactsDto,
  UpdateContactDto,
  createContactSchema,
  listContactsSchema,
  updateContactSchema,
} from './dto/friends.dto';
import { FriendsService } from './friends.service';

/**
 * Danh bạ — vừa là nơi quản lý bạn bè, vừa LÀ màn hình trả lời "ai đang nợ mình bao nhiêu".
 * Vì vậy không có thêm một nhóm endpoint "công nợ" nào nữa.
 */
@Controller('contacts')
export class ContactsController {
  constructor(private readonly service: FriendsService) {}

  @Get()
  list(
    @CurrentUser('id') userId: string,
    @Query(new ZodValidationPipe(listContactsSchema)) query: ListContactsDto,
  ) {
    return this.service.listContacts(userId, query);
  }

  @Get(':id')
  detail(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getContactDetail(userId, id);
  }

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(createContactSchema)) dto: CreateContactDto,
  ) {
    return this.service.createContact(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateContactSchema)) dto: UpdateContactDto,
  ) {
    return this.service.updateContact(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteContact(userId, id);
  }
}
