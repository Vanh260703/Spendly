import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';

/**
 * Guard mặc định cho TOÀN BỘ API — đăng ký qua `APP_GUARD` trong `AuthModule`.
 *
 * Mặc định là **chặn**, mở ra phải khai báo `@Public()`. Với dữ liệu tài chính cá nhân,
 * quên bảo vệ một endpoint nguy hiểm hơn nhiều so với quên mở một endpoint công khai.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return isPublic ? true : super.canActivate(context);
  }
}
