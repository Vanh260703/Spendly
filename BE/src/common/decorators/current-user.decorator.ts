import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Người dùng của request, do `SingleUserGuard` gắn vào. */
export interface AuthUser {
  id: string;
}

/**
 * Lấy user hiện tại: `@CurrentUser() user: AuthUser`.
 *
 * ⚠️ Vẫn là NGUỒN DUY NHẤT được phép cung cấp `userId` cho truy vấn. Không nhận `userId`
 * từ body/query/param — dù giờ chỉ có một người dùng, giữ nguyên tắc này thì ngày thêm auth
 * trở lại không phải rà lại từng query.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
    return data ? user?.[data] : user;
  },
);
