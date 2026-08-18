import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Một người trong DANH BẠ của user.
 *
 * ⚠️ **Đây KHÔNG phải tài khoản.** Không đăng ký, không mời, không email, không đồng bộ —
 * chỉ là sổ tên riêng của user. `id` là khóa nội bộ, người dùng không bao giờ nhìn thấy.
 *
 * Vì sao phải có bảng riêng thay vì lưu chuỗi tên vào từng dòng chia bill: "Tuấn" / "tuấn" /
 * "anh Tuấn" sẽ thành ba người khác nhau, công nợ bị xé nhỏ và không cộng lại được — hỏng
 * đúng thứ tính năng này sinh ra để làm. Có bảng riêng thì đổi tên sửa MỘT chỗ, toàn bộ lịch
 * sử đúng theo.
 */
@Entity('contacts')
// Chống trùng do hoa/thường/khoảng trắng. KHÔNG chống trùng theo dấu — xem `nameNormalized`.
@Unique(['userId', 'nameNormalized'])
@Index(['userId', 'isArchived'])
export class Contact extends BaseEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Tên hiển thị, giữ nguyên đúng như user gõ. VD "Anh Tuấn" */
  @Column()
  name: string;

  /**
   * `name.trim().toLowerCase()` — CHỈ dùng để chống trùng.
   *
   * ⚠️ **Cố ý KHÔNG bỏ dấu.** "Tuấn" và "Tuan" có thể là hai người thật; tự động gộp thì
   * công nợ của hai người dồn làm một và rất khó lần ra đã sai từ đâu. Gộp là thao tác thủ
   * công, có chủ đích.
   */
  @Column()
  nameNormalized: string;

  /** Số điện thoại — để tiện nhắn đòi tiền */
  @Column({ type: 'varchar', nullable: true })
  phone?: string | null;

  /** Ghi chú tự do, VD "bạn cùng phòng" */
  @Column({ type: 'varchar', nullable: true })
  note?: string | null;

  /** Màu nền avatar chữ cái đầu — để nhận mặt nhanh trong danh sách dài */
  @Column({ default: '#64748b' })
  color: string;

  /**
   * URL ảnh QR chuyển tiền của người này (Cloudinary `secure_url`).
   *
   * Để khỏi phải đi hỏi lại QR mỗi lần trả nợ. Chỉ là một chuỗi URL — BE không hiểu nội dung
   * bên trong mã QR và không cần hiểu.
   *
   * ⚠️ `text` chứ không `varchar`: URL Cloudinary có thể dài khi kèm transformation.
   */
  @Column({ type: 'text', nullable: true })
  qrImage?: string | null;

  /**
   * `public_id` của chính tấm ảnh trên — **chỉ dùng để XÓA nó đi**.
   *
   * Không có cột này thì mỗi lần user thay QR mới là tấm cũ nằm lại trên Cloudinary vĩnh
   * viễn. Suy ngược `public_id` từ URL được, nhưng phải tự bóc version với phần mở rộng và
   * sẽ sai ngay khi Cloudinary đổi dạng URL — lưu thẳng thì không phải đoán.
   */
  @Column({ type: 'varchar', nullable: true })
  qrImagePublicId?: string | null;

  /**
   * Ẩn khỏi ô chọn người nhưng GIỮ nguyên lịch sử.
   *
   * Dùng cho người không còn qua lại nữa. Xóa hẳn bị chặn khi công nợ khác 0.
   */
  @Column({ default: false })
  isArchived: boolean;
}
