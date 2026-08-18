import { Global, Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';

/**
 * `@Global()` cùng lý do với `RedisModule`: đây là hạ tầng, không phải domain. Hiện mới có
 * `friends` dùng, nhưng ảnh hóa đơn (nếu làm) sẽ dùng lại y nguyên — khỏi phải đi import lặp.
 */
@Global()
@Module({
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
