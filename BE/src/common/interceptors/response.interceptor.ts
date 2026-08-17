import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiResponse<T> {
  success: true;
  data: T;
}

/**
 * Bọc mọi response thành `{ success: true, data }` để FE chỉ phải xử lý một hình dạng
 * duy nhất (xem `API_ENDPOINTS.md`). Controller cứ trả dữ liệu thô, interceptor lo phần vỏ.
 *
 * Bỏ qua response rỗng (204 No Content) — bọc `null` vào envelope là vô nghĩa.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  intercept(
    _ctx: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T> | T> {
    return next.handle().pipe(
      map((data) =>
        data === undefined || data === null ? data : { success: true as const, data },
      ),
    );
  }
}
