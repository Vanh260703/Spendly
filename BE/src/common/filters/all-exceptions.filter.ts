import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';

/** Mã lỗi Postgres — xem https://www.postgresql.org/docs/current/errcodes-appendix.html */
const PG = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
} as const;

/**
 * Chuẩn hóa MỌI lỗi thành `{ success: false, message, statusCode }` (xem `API_ENDPOINTS.md`).
 *
 * Hai nguyên tắc:
 * 1. **Không rò rỉ chi tiết nội bộ.** Lỗi 500 chỉ trả thông báo chung; stack trace vào log.
 *    Thông báo lỗi DB thô có thể để lộ tên bảng/cột cho người ngoài.
 * 2. **Dịch lỗi DB sang HTTP đúng nghĩa.** Vi phạm UNIQUE là `409` chứ không phải `500` —
 *    đăng ký trùng email là lỗi của người dùng, không phải sự cố hệ thống.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Đã có lỗi xảy ra, vui lòng thử lại';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      const raw =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);
      message = Array.isArray(raw) ? raw.join(' · ') : raw;
    } else if (exception instanceof QueryFailedError) {
      const code = (exception as QueryFailedError & { code?: string }).code;

      if (code === PG.UNIQUE_VIOLATION) {
        status = HttpStatus.CONFLICT;
        message = 'Dữ liệu đã tồn tại';
      } else if (code === PG.FOREIGN_KEY_VIOLATION) {
        status = HttpStatus.CONFLICT;
        message = 'Dữ liệu đang được tham chiếu ở nơi khác, không thể thao tác';
      }
      this.logger.error(`DB ${code}: ${exception.message}`);
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    res.status(status).json({ success: false, message, statusCode: status });
  }
}
