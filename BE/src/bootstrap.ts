import { INestApplication } from '@nestjs/common';
import { json } from 'express';

/**
 * Cấu hình app dùng chung cho `main.ts` **và** test e2e.
 *
 * Tách ra để test chạy trên đúng cấu hình như production — test tự dựng app theo cách
 * riêng sẽ không phát hiện được lỗi nằm ở chính lớp cấu hình.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api/v1');

  /**
   * ⚠️ Nới giới hạn body JSON lên 2MB — mặc định của Express là **100kb**.
   *
   * Ảnh QR gửi lên dạng base64, mà base64 phình khoảng 33% so với ảnh gốc: một ảnh 200KB
   * thành ~270KB, vượt xa mặc định. Không nới thì upload chết với `413 Payload Too Large`,
   * một lỗi không nói gì về nguyên nhân thật.
   *
   * 2MB đủ rộng cho ảnh chụp màn hình, còn Zod ở `friends.dto.ts` mới là chỗ chặn chặt hơn.
   */
  app.use(json({ limit: '2mb' }));

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
    credentials: true,
  });

  return app;
}
