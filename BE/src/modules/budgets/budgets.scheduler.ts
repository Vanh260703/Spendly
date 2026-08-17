import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BudgetsService } from './budgets.service';

/** Múi giờ nghiệp vụ của app — chốt cứng để cron không phụ thuộc timezone máy chủ */
const MUI_GIO = 'Asia/Ho_Chi_Minh';

/**
 * Chốt kỳ ngân sách — chạy MỖI NGÀY lúc **00:30 giờ Việt Nam**.
 *
 * Chạy hằng ngày chứ không phải cuối tháng: `monthStartDay` khác nhau giữa các user
 * (người để ngày 1, người để ngày 25) nên "cuối kỳ" không phải một mốc chung. Job tự xét
 * từng ngân sách xem kỳ trước của NÓ đã đóng chưa.
 *
 * Giờ chạy không quan trọng vì `closeDuePeriods()` luôn tính lại kỳ từ thời điểm hiện tại,
 * và **idempotent** nhờ `UNIQUE(budgetId, periodStart)`: chạy thừa thì bỏ qua, chạy sót
 * thì lần sau tự bù. Máy tắt 3 ngày rồi bật lại vẫn chốt đủ.
 *
 * ⚠️ **Phải khai `timeZone` tường minh.** `@Cron` mặc định dùng timezone của MÁY CHỦ —
 * máy dev là `Asia/Saigon` nhưng Railway/VPS thường là UTC, nên cùng một biểu thức cron
 * sẽ chạy vào hai thời điểm khác nhau. Job này idempotent nên không hỏng, nhưng giờ chạy
 * trôi nổi theo nơi deploy là thứ rất khó lần khi cần debug.
 *
 * Chạy 00:30 chứ không phải 00:00 để **luôn xong trước job báo cáo AI (08:00)** — báo cáo
 * đọc `rolloverIn` của kỳ mới, mà con số đó chỉ có sau khi kỳ trước được chốt.
 *
 * ⚠️ Cron chỉ sống cùng tiến trình BE. Deploy dạng serverless/scale-to-zero thì job này
 * sẽ không chạy — lúc đó phải chuyển sang cron ngoài (Railway cron, GitHub Actions)
 * gọi vào một endpoint nội bộ.
 */
@Injectable()
export class BudgetsScheduler {
  private readonly logger = new Logger(BudgetsScheduler.name);

  constructor(private readonly budgets: BudgetsService) {}

  @Cron('30 0 * * *', { timeZone: MUI_GIO })
  async chotKyNganSach(): Promise<void> {
    try {
      const soKy = await this.budgets.closeDuePeriods();
      if (soKy > 0) this.logger.log(`Đã chốt ${soKy} kỳ ngân sách`);
    } catch (err) {
      // Job lỗi không được làm sập app — lần chạy sau sẽ bù vì job idempotent
      this.logger.error(`Chốt kỳ ngân sách lỗi: ${(err as Error).message}`);
    }
  }
}
