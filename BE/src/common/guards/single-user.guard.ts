import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SingleUserService } from '../../modules/users/single-user.service';
import { AuthUser } from '../decorators/current-user.decorator';

/**
 * Gắn người dùng DUY NHẤT vào mọi request — thay cho `JwtAuthGuard` đã gỡ.
 *
 * App không còn đăng nhập, nhưng controller vẫn dùng `@CurrentUser()` và mọi query vẫn lọc
 * theo `userId`. Guard này là chỗ nối hai điều đó: nó không TỪ CHỐI ai cả, chỉ nói cho tầng
 * dưới biết "user" là ai.
 *
 * Giữ hình dạng này thay vì gỡ `userId` khắp nơi để ngày nào cần auth trở lại thì chỉ phải
 * thay đúng file này.
 *
 * ⚠️ **Guard này KHÔNG bảo vệ gì cả.** Ai gọi được API là đọc được toàn bộ dữ liệu ngân
 * hàng. An toàn phụ thuộc hoàn toàn vào việc API không lộ ra Internet.
 */
@Injectable()
export class SingleUserGuard implements CanActivate {
  constructor(private readonly singleUser: SingleUserService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    req.user = { id: await this.singleUser.layUserId() };
    return true;
  }
}
