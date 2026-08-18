import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';

/** `CloudinaryService` đến từ `CloudinaryModule` (@Global) nên không cần import lại ở đây */
@Module({
  controllers: [UploadsController],
})
export class UploadsModule {}
