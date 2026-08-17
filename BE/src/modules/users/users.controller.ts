import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  ChangePasswordDto,
  OnboardingDto,
  UpdateUserDto,
  changePasswordSchema,
  onboardingSchema,
  updateUserSchema,
} from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getProfile(user.id);
  }

  @Patch('me')
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserDto,
  ) {
    return this.users.update(user.id, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch('me/password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordDto,
  ) {
    return this.users.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Post('me/onboarding')
  onboarding(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(onboardingSchema)) dto: OnboardingDto,
  ) {
    return this.users.completeOnboarding(user.id, dto);
  }
}
