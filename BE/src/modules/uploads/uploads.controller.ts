import { Controller, Get } from '@nestjs/common';
import { CloudinaryService, type ChuKyUpload } from '../../shared/cloudinary';

/**
 * Cấp chữ ký để FE upload ảnh thẳng lên Cloudinary.
 *
 * Không có `@Public()` — phải đăng nhập mới xin được chữ ký, nếu không thì bất kỳ ai cũng
 * upload được vào account Cloudinary và đốt sạch quota.
 */
@Controller('uploads')
export class UploadsController {
  constructor(private readonly cloudinary: CloudinaryService) {}

  /** `GET /uploads/signature` → 503 kèm hướng dẫn nếu chưa cấu hình Cloudinary */
  @Get('signature')
  kyUpload(): ChuKyUpload {
    return this.cloudinary.kyUpload();
  }
}
