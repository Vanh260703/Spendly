import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { money } from '../../../common/transformers/money.transformer';

/**
 * Người dùng — **luôn có đúng MỘT dòng** (xem `SingleUserService`).
 *
 * App không còn đăng nhập nên không có `email`/`passwordHash`. Bảng vẫn tồn tại vì mọi
 * entity khác khóa ngoại tới nó, và cài đặt cá nhân (`timezone`, `monthStartDay`) phải
 * nằm ở đâu đó.
 */
@Entity('users')
export class User extends BaseEntity {
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

  // không phải ở đây.

  /**
   * Thu nhập hàng tháng ước tính — user tự khai, dùng để gợi ý ngân sách theo khung
   * 50/30/20 và để AI quy đổi "khoản này chiếm bao nhiêu % thu nhập".
   */
  @Column({ type: 'bigint', nullable: true, transformer: money })
  monthlyIncome?: number | null;

  /** null = chưa qua onboarding → FE điều hướng vào màn hình thiết lập ban đầu */
  @Column({ type: 'timestamptz', nullable: true })
  onboardedAt?: Date | null;
}
