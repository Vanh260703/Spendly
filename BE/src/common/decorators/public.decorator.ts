import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Đánh dấu endpoint KHÔNG cần token.
 *
 * `JwtAuthGuard` được đặt global (`APP_GUARD`) nên mặc định mọi route đều phải có token —
 * đây là chủ ý: quên bảo vệ một endpoint dữ liệu tài chính nguy hiểm hơn nhiều so với
 * quên mở một endpoint công khai.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
