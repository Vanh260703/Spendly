import { Body, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SepayApiClient } from './sepay-api.client';
import { SepaySyncService } from './sepay-sync.service';

const syncSchema = z.object({
  /**
   * `yyyy-mm-dd` — chỉ dùng để NẠP LỊCH SỬ CŨ lần đầu.
   *
   * Bỏ trống thì đồng bộ tăng dần từ giao dịch mới nhất đang có, nhanh hơn nhiều.
   */
  tuNgay: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải dạng yyyy-mm-dd')
    .optional(),
});

type SyncDto = z.infer<typeof syncSchema>;

/** Đồng bộ giao dịch từ SePay — thay cho webhook đã gỡ */
@Controller('sepay')
export class SepayController {
  constructor(
    private readonly sync: SepaySyncService,
    private readonly api: SepayApiClient,
  ) {}

  /** Trạng thái để giao diện biết có bật được nút đồng bộ không */
  @Get('status')
  status() {
    return { configured: this.api.isConfigured };
  }

  /**
   * Kéo giao dịch về — nút "Đồng bộ" trên giao diện gọi vào đây.
   *
   * Chạy được bao nhiêu lần cũng không sao: khóa `(userId, sepayId)` chặn trùng, nên bấm
   * mười lần vẫn ra đúng một bộ dữ liệu.
   */
  @Post('sync')
  dongBo(@Body(new ZodValidationPipe(syncSchema)) dto: SyncDto) {
    return this.sync.dongBo(dto.tuNgay);
  }
}
