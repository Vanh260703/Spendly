import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Thông tin user lấy từ JWT, do `JwtStrategy.validate()` gắn vào request. */
export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Lấy user hiện tại từ token: `@CurrentUser() user: AuthUser`.
 *
 * ⚠️ Đây là NGUỒN DUY NHẤT được phép cung cấp `userId` cho mọi truy vấn.
 * **Không bao giờ** nhận `userId` từ body/query/param của client — làm vậy là để lộ
 * dữ liệu tài chính của người khác chỉ bằng cách đổi một tham số trên URL.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
    return data ? user?.[data] : user;
  },
);
