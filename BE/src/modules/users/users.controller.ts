import { Controller, Get } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

/**
 * Hồ sơ — **chỉ đọc**.
 *
 * Mọi cài đặt (múi giờ, ngày bắt đầu chu kỳ tháng, tài khoản ngân hàng) khai trong `.env`
 * và `SingleUserService` đồng bộ lúc khởi động. Sửa file rồi restart là xong — không cần
 * màn hình cài đặt, không cần endpoint sửa.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getProfile(user.id);
  }
}
