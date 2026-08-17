import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  UpdateWalletDto,
  toWalletDto,
  updateWalletSchema,
} from './dto/wallet.dto';
import { WalletsService } from './wallets.service';

/**
 * Đường dẫn số ít `/wallet`, không có `:id`, không có `POST`/`DELETE` —
 * mỗi user có đúng MỘT ví chung, tạo tự động lúc đăng ký (SPEC §3).
 */
@Controller('wallet')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    return toWalletDto(await this.wallets.findByUser(user.id));
  }

  @Patch()
  async update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateWalletSchema)) dto: UpdateWalletDto,
  ) {
    return toWalletDto(await this.wallets.update(user.id, dto));
  }
}
