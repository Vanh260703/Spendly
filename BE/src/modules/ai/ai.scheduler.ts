import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { resolvePeriod, shiftRange } from '../../common/utils/period';
import { User } from '../users/entities/user.entity';
import { AiService } from './ai.service';
import { AiInsight, InsightKind } from './entities/ai-insight.entity';
import { LlmClient } from './llm.client';

/** Múi giờ nghiệp vụ — khai rõ để cron không phụ thuộc timezone máy chủ */
const MUI_GIO = 'Asia/Ho_Chi_Minh';

/**
 * Tự sinh MỌI phân tích AI định kỳ cho kỳ VỪA ĐÓNG (xem `VIEC_DINH_KY`) — chạy **08:00
 * sáng giờ Việt Nam mỗi ngày**.
 *
 * Vì sao cần job này: `GET /ai/report?period=week` luôn tính **tuần hiện tại**, nên không
 * có cách nào xin báo cáo của tuần trước. Nếu chỉ sinh khi user mở trang thì báo cáo một
 * tuần chỉ tồn tại nếu tình cờ user vào app trong đúng tuần đó — kho báo cáo sẽ thủng lỗ chỗ.
 *
 * Chạy MỖI NGÀY và luôn hỏi "báo cáo của kỳ trước đã có chưa?":
 * - Đã có → bỏ qua (nên chạy thừa vô hại)
 * - Chưa → sinh
 *
 * Nhờ vậy job **tự bù**: máy tắt vài ngày, bật lại vẫn sinh được báo cáo tuần trước.
 *
 * **Vì sao 08:00 chứ không phải ngay lúc 00:00 Thứ Hai:**
 * - Người ta hay ghi bù khoản chi Chủ nhật vào sáng Thứ Hai. Sinh báo cáo lúc nửa đêm sẽ
 *   bỏ sót những khoản đó, mà báo cáo đã sinh rồi thì job không sinh lại nữa.
 * - 08:00 là lúc mở app xem báo cáo, không phải lúc ngủ.
 *
 * **Không bao giờ sinh nhầm kỳ chưa kết thúc**: job luôn nhắm kỳ TRƯỚC kỳ hiện tại, mà
 * kỳ hiện tại tính theo múi giờ của từng user. Chạy vào giờ nào thì "kỳ trước" cũng đã
 * đóng xong — giờ chạy chỉ ảnh hưởng tới việc báo cáo xuất hiện SỚM hay MUỘN.
 */
/**
 * Báo cáo của một kỳ đã được CHỐT chưa?
 *
 * Chốt = sinh ra SAU thời điểm kỳ đóng, tức dựng trên dữ liệu đầy đủ. Bản sinh giữa kỳ
 * (user mở `/ai` khi kỳ còn đang chạy) chỉ là ảnh chụp dang dở và phải bị sinh lại.
 *
 * Tách thành hàm thuần để test được mà không cần DB lẫn API của nhà cung cấp.
 */
export function baoCaoDaChot(
  daCo: { updatedAt: Date } | null | undefined,
  ketThucKy: Date,
): boolean {
  return !!daCo && daCo.updatedAt > ketThucKy;
}

interface ViecDinhKy {
  kind: InsightKind;
  period: 'week' | 'month';
  /** Tên tiếng Việt để đọc log */
  ten: string;
}

/**
 * Những thứ AI sinh tự động sau khi một kỳ khép lại.
 *
 * **Đây là nguồn DUY NHẤT tạo ra chúng** — không màn hình nào được phép gọi AI sinh mấy
 * thứ này lúc user mở trang. Mở trang mà tự gọi thì vừa tốn quota cho câu trả lời không ai
 * xin, vừa đẩy vào kho một bản dựng từ dữ liệu của kỳ mới chạy được vài ngày.
 *
 * Thêm loại phân tích định kỳ mới thì thêm một dòng ở đây, không sửa vòng lặp.
 */
const VIEC_DINH_KY: readonly ViecDinhKy[] = [
  { kind: InsightKind.WEEKLY, period: 'week', ten: 'báo cáo tuần' },
  { kind: InsightKind.MONTHLY, period: 'month', ten: 'báo cáo tháng' },
  { kind: InsightKind.NECESSITY, period: 'week', ten: 'phân tích khoản không cần thiết' },
];

@Injectable()
export class AiScheduler {
  private readonly logger = new Logger(AiScheduler.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AiInsight) private readonly insights: Repository<AiInsight>,
    private readonly ai: AiService,
    private readonly llm: LlmClient,
  ) {}

  @Cron('0 8 * * *', { timeZone: MUI_GIO })
  async sinhBaoCaoKyTruoc(): Promise<void> {
    // Chưa cấu hình AI thì đừng chạy — tránh log lỗi mỗi ngày một cách vô ích
    if (!this.llm.isConfigured) return;

    const users = await this.users.find();

    for (const user of users) {
      for (const viec of VIEC_DINH_KY) {
        try {
          await this.sinhChoKy(user, viec);
        } catch (err) {
          /**
           * Kỳ đó KHÔNG CÓ GIAO DỊCH là chuyện bình thường (mới dùng app, hoặc cả tuần
           * không tiêu gì) — không phải lỗi. Bỏ qua im lặng, nếu không mỗi ngày sẽ có một
           * dòng cảnh báo vô nghĩa cho tới hết đời.
           *
           * Vẫn thử lại vào ngày sau: nếu user nhập bù giao dịch của tuần đó thì kết quả
           * sẽ được sinh khi có dữ liệu.
           */
          if (err instanceof BadRequestException) continue;

          // Lỗi thật (hết quota, mạng, AI lỗi): một user không được chặn những user còn
          // lại — lần chạy ngày mai sẽ thử lại
          this.logger.warn(
            `Không sinh được ${viec.ten} cho ${user.email}: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  private async sinhChoKy(user: User, viec: ViecDinhKy): Promise<void> {
    const kyHienTai = resolvePeriod(viec.period, {
      timezone: user.timezone,
      monthStartDay: user.monthStartDay,
    });
    const kyTruoc = shiftRange(kyHienTai, 1, viec.period);

    const daCo = await this.insights.findOneBy({
      userId: user.id,
      kind: viec.kind,
      periodStart: kyTruoc.start,
    });

    /**
     * Có bản ghi rồi thì CHƯA chắc được bỏ qua — phải xét nó sinh ra lúc nào.
     *
     * Bản sinh khi kỳ còn ĐANG CHẠY chỉ là ảnh chụp dang dở (mới 2–3 ngày dữ liệu). Nếu
     * chỉ hỏi "đã có chưa?" thì sáng Thứ Hai job thấy có và bỏ qua — bản dang dở đó bị giữ
     * lại vĩnh viễn làm kết quả tổng kết của cả kỳ.
     *
     * Chỉ coi là CHỐT khi sinh ra SAU thời điểm kỳ đóng. Suy ra từ `updatedAt`, không thêm
     * cột `isFinal` — cột như vậy chỉ là bản sao của dữ kiện đã có và sẽ lệch ngay lần đầu
     * ai đó quên cập nhật.
     */
    if (baoCaoDaChot(daCo, kyTruoc.end)) return;

    const range = {
      start: new Date(kyTruoc.start.getTime()),
      end: new Date(kyTruoc.end.getTime()),
    };

    if (viec.kind === InsightKind.NECESSITY) {
      await this.ai.necessityReview(user.id, viec.period, range);
    } else {
      await this.ai.periodReport(user.id, viec.period, range);
    }

    this.logger.log(
      `${daCo ? 'Đã CHỐT LẠI' : 'Đã sinh'} ${viec.ten} cho ${user.email}: ` +
        `${kyTruoc.start.toISOString().slice(0, 10)}`,
    );
  }
}
