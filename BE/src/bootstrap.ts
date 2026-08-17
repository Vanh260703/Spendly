import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/**
 * Cấu hình app dùng chung cho `main.ts` **và** test e2e.
 *
 * Tách ra để test chạy trên đúng cấu hình như production. Nếu test tự dựng app theo cách
 * riêng, nó sẽ không phát hiện được lỗi ở chính lớp cấu hình — VD quên `cookieParser()`
 * thì auth refresh gãy ngoài đời nhưng test vẫn xanh.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());

  /**
   * CORS nhận DANH SÁCH origin, phân tách bằng dấu phẩy — FE deploy trên Cloudflare Pages
   * có nhiều domain cùng lúc: domain chính, `*.pages.dev`, và bản preview mỗi lần deploy.
   *
   * ⚠️ `credentials: true` **không đi cùng `origin: '*'`** được: trình duyệt từ chối gửi
   * cookie khi server trả wildcard. Bắt buộc liệt kê origin cụ thể.
   */
  const origins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true, // cần cho refresh token trong httpOnly cookie
  });

  return app;
}
