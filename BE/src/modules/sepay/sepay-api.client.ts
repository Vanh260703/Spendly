import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Một dòng giao dịch đúng như SePay trả về — mọi số đều là CHUỖI */
export interface SepayApiTransaction {
  id: string;
  bank_brand_name: string;
  account_number: string;
  /** `"2026-08-26 21:15:00"` — giờ VN, không kèm múi giờ */
  transaction_date: string;
  /** Tiền RA. `"0.00"` khi đây là giao dịch tiền vào. */
  amount_out: string;
  /** Tiền VÀO. `"0.00"` khi đây là giao dịch tiền ra. */
  amount_in: string;
  /** Số dư sau giao dịch */
  accumulated: string;
  transaction_content: string | null;
  reference_number: string | null;
  code: string | null;
  sub_account: string | null;
  bank_account_id: string;
}

interface DanhSachResponse {
  status: number;
  error: string | null;
  transactions: SepayApiTransaction[];
}

/**
 * Gọi sang SePay để KÉO giao dịch về.
 *
 * Chỉ lo phần mạng — không đụng tới DB, không hiểu nghiệp vụ. Tách vậy để test được phần
 * chuẩn hóa dữ liệu mà không cần token thật.
 *
 * Tài liệu: https://docs.sepay.vn/api-giao-dich.html
 */
@Injectable()
export class SepayApiClient {
  private readonly logger = new Logger(SepayApiClient.name);

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return !!this.config.get<string>('SEPAY_API_TOKEN');
  }

  /**
   * Lấy danh sách giao dịch.
   *
   * `sinceId` là chìa khóa của việc đồng bộ tăng dần: chỉ xin những gì mới hơn ID lớn nhất
   * đang có, thay vì kéo lại 5000 dòng mỗi lần.
   *
   * ⚠️ SePay giới hạn **5000 dòng mỗi lần gọi** và đó cũng là mặc định. Lần đồng bộ đầu tiên
   * của một tài khoản nhiều năm có thể vượt con số đó — nên hàm gọi phải lặp cho tới khi
   * trả về ít hơn `limit` (xem `SepaySyncService`).
   */
  async layDanhSach(args: {
    accountNumber: string;
    sinceId?: number;
    tuNgay?: string;
    limit?: number;
  }): Promise<SepayApiTransaction[]> {
    const params = new URLSearchParams({ account_number: args.accountNumber });
    if (args.sinceId) params.set('since_id', String(args.sinceId));
    if (args.tuNgay) params.set('transaction_date_min', args.tuNgay);
    params.set('limit', String(args.limit ?? 5000));

    const res = await this.goi(`/userapi/transactions/list?${params}`);
    const body = (await res.json()) as DanhSachResponse;

    if (body.error) {
      throw new HttpException(`SePay báo lỗi: ${body.error}`, HttpStatus.BAD_GATEWAY);
    }
    return body.transactions ?? [];
  }

  /**
   * Gọi API kèm xử lý giới hạn tốc độ.
   *
   * ⚠️ SePay cho **3 lần gọi/giây**; vượt thì trả `429` kèm header
   * `x-sepay-userapi-retry-after` (đơn vị giây). Tôn trọng header đó thay vì tự đoán thời
   * gian chờ — đoán sai thì hoặc chờ thừa, hoặc bị chặn tiếp.
   *
   * Chỉ thử lại MỘT lần: 429 lặp lại nghĩa là có thứ khác đang gọi song song, và cron sẽ
   * chạy lại sau vài giờ nên không việc gì phải cố.
   */
  private async goi(path: string, daThuLai = false): Promise<Response> {
    const token = this.config.get<string>('SEPAY_API_TOKEN');
    if (!token) {
      throw new HttpException(
        'Chưa cấu hình SEPAY_API_TOKEN — không đồng bộ được.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const base = this.config.get<string>('SEPAY_API_URL')!;
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });

    if (res.status === 429 && !daThuLai) {
      const cho = Number(res.headers.get('x-sepay-userapi-retry-after') ?? 1);
      this.logger.warn(`Bị giới hạn tốc độ, chờ ${cho}s rồi thử lại`);
      await new Promise((r) => setTimeout(r, cho * 1000));
      return this.goi(path, true);
    }

    if (!res.ok) {
      throw new HttpException(this.dienGiaiLoi(res.status), HttpStatus.BAD_GATEWAY);
    }
    return res;
  }

  /** Dịch mã lỗi thành câu nói rõ phải làm gì, thay vì "lỗi 401" chung chung */
  private dienGiaiLoi(status: number): string {
    if (status === 401 || status === 403) {
      return 'SePay từ chối token (401/403) — kiểm tra lại SEPAY_API_TOKEN trong .env';
    }
    if (status === 429) return 'Gọi SePay quá nhanh (429) — thử lại sau ít phút';
    if (status >= 500) return `SePay đang lỗi (${status}) — thử lại sau`;
    return `SePay trả về ${status}`;
  }
}
