import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { money } from '../../../common/transformers/money.transformer';

@Entity('users')
export class User extends BaseEntity {
  /** Email đăng nhập, không trùng nhau */
  @Column({ unique: true })
  email: string;

  /**
   * Mật khẩu đã băm bằng argon2id.
   * KHÔNG BAO GIỜ lưu mật khẩu gốc, và không bao giờ trả field này ra API.
   */
  @Column({ select: false })
  passwordHash: string;

  /** Tên hiển thị, VD "Việt Anh" */
  @Column()
  name: string;

  /** Link ảnh đại diện, có thể để trống */
  @Column({ type: 'varchar', nullable: true })
  avatarUrl?: string | null;

  /** Múi giờ — quyết định "hôm nay" bắt đầu lúc mấy giờ khi tính báo cáo */
  @Column({ default: 'Asia/Ho_Chi_Minh' })
  timezone: string;

  /**
   * Ngày bắt đầu chu kỳ tháng (1–28).
   * - `1`  → tháng dương lịch bình thường
   * - `25` → "tháng" chạy từ 25 tháng này tới 24 tháng sau (theo ngày nhận lương)
   */
  @Column({ type: 'int', default: 1 })
  monthStartDay: number;

  // Số dư ban đầu + mốc bắt đầu nằm ở entity `Wallet` (quan hệ 1–1, tạo tự động lúc đăng ký),
  // không phải ở đây.

  /**
   * Thu nhập hàng tháng ước tính — hỏi lúc onboarding, dùng để gợi ý ngân sách theo
   * khung 50/30/20 và để AI quy đổi "khoản này chiếm bao nhiêu % thu nhập".
   */
  @Column({ type: 'bigint', nullable: true, transformer: money })
  monthlyIncome?: number | null;

  /** null = chưa qua onboarding → FE điều hướng vào màn hình thiết lập ban đầu */
  @Column({ type: 'timestamptz', nullable: true })
  onboardedAt?: Date | null;
}
