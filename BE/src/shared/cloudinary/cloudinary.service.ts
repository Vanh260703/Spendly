import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

/** Kết quả cấp cho FE để nó tự upload thẳng lên Cloudinary */
export interface ChuKyUpload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

/**
 * Cloudinary — nơi lưu ảnh QR chuyển tiền.
 *
 * **Vì sao FE upload THẲNG lên Cloudinary chứ không đi qua BE:** FE build tĩnh
 * (`output: 'export'`) nên không có route handler để proxy, mà đẩy file qua BE thì phải
 * thêm multer, giữ nguyên file trong RAM, và tốn hai lần băng thông cho cùng một tấm ảnh.
 * BE chỉ ký — `CLOUDINARY_API_SECRET` không bao giờ rời khỏi server.
 *
 * **Suy giảm êm, cùng nguyên tắc với Redis:** chưa cấu hình thì `kyUpload()` ném 503 nói rõ
 * thiếu biến nào, còn `xoa()` chỉ ghi log. Xóa ảnh thất bại tuyệt đối không được làm hỏng
 * thao tác xóa người trong danh bạ — mất một tấm ảnh chỉ tốn dung lượng, còn để user không
 * xóa nổi một bản ghi vì dịch vụ ngoài đang chết thì mới là hỏng thật.
 */
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  /** Gom ảnh vào một thư mục để dọn tay khi cần và không lẫn với thứ khác trong account */
  static readonly FOLDER = 'spendly/contact-qr';

  constructor(private readonly config: ConfigService) {}

  private get cloudName() {
    return this.config.get<string>('CLOUDINARY_CLOUD_NAME');
  }
  private get apiKey() {
    return this.config.get<string>('CLOUDINARY_API_KEY');
  }
  private get apiSecret() {
    return this.config.get<string>('CLOUDINARY_API_SECRET');
  }

  get daCauHinh(): boolean {
    return !!(this.cloudName && this.apiKey && this.apiSecret);
  }

  /**
   * Cấp chữ ký cho một lần upload.
   *
   * Chữ ký gắn với `timestamp`, và Cloudinary chỉ chấp nhận trong khoảng ~1 giờ — nên
   * không dùng lại được vô hạn. Mỗi lần chọn ảnh là xin một chữ ký mới.
   */
  kyUpload(): ChuKyUpload {
    if (!this.daCauHinh) {
      throw new ServiceUnavailableException(
        'Chưa cấu hình Cloudinary — cần CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY và CLOUDINARY_API_SECRET trong BE/.env',
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = CloudinaryService.FOLDER;

    /*
      Ký bằng SDK chính thức thay vì tự nối chuỗi rồi băm: quy tắc là "bỏ file/cloud_name/
      resource_type/api_key, sắp xếp theo tên, nối bằng &, ghép api_secret vào cuối rồi băm".
      Tự làm thì sai một dấu & hay một tham số bị bỏ sót là Cloudinary trả 401 chung chung,
      không nói sai ở đâu — đúng loại lỗi tốn cả buổi để lần ra.

      ⚠️ Tham số nào ký ở đây thì FE PHẢI gửi lên y hệt, không thừa không thiếu.
    */
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      this.apiSecret!,
    );

    return {
      cloudName: this.cloudName!,
      apiKey: this.apiKey!,
      timestamp,
      signature,
      folder,
    };
  }

  /**
   * Xóa một ảnh đã upload. **Không bao giờ ném lỗi** — xem ghi chú ở đầu class.
   *
   * Gọi khi người trong danh bạ bị xóa, hoặc khi QR được thay bằng ảnh mới (ảnh cũ mà không
   * xóa thì nằm lại vĩnh viễn, tích dần thành rác không ai biết để dọn).
   */
  async xoa(publicId: string | null | undefined): Promise<void> {
    if (!publicId || !this.daCauHinh) return;

    try {
      cloudinary.config({
        cloud_name: this.cloudName,
        api_key: this.apiKey,
        api_secret: this.apiSecret,
      });
      await cloudinary.uploader.destroy(publicId);
    } catch (e) {
      this.logger.warn(
        `Không xóa được ảnh "${publicId}" trên Cloudinary: ${(e as Error).message}. ` +
          'Bản ghi trong DB vẫn được xóa; ảnh này thành rác, dọn tay khi cần.',
      );
    }
  }
}
