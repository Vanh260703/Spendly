import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodType, ZodTypeDef } from 'zod';

/**
 * Validate body/query bằng Zod: `@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto`.
 *
 * Dùng Zod thay vì class-validator để sau này FE và BE **dùng chung một schema**
 * (xem `SPEC.md` §5) — định nghĩa quy tắc hai lần là chắc chắn có ngày lệch nhau.
 *
 * Trả `400` kèm thông báo tiếng Việt đọc được, không phải chuỗi lỗi thô của Zod.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  /**
   * Kiểu input là `unknown` chứ không phải `T`: schema có `.default()` hoặc `.transform()`
   * sẽ có input khác output (VD `limit` optional lúc vào, luôn có giá trị lúc ra).
   * Ràng buộc input = output sẽ khiến những schema đó không truyền vào pipe được.
   */
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);

    if (!parsed.success) {
      const chiTiet = parsed.error.issues
        .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
        .join(' · ');
      throw new BadRequestException(chiTiet);
    }

    return parsed.data;
  }
}
