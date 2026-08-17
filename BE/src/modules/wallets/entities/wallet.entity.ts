import { Column, Entity, JoinColumn, OneToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { money } from '../../../common/transformers/money.transformer';
import { User } from '../../users/entities/user.entity';

/**
 * VÍ CHUNG — nơi chứa toàn bộ tiền của user.
 *
 * ⚠️ Cố ý **chỉ có MỘT ví cho mỗi user** (ràng buộc `@Unique(['userId'])`), không chia
 * theo loại (tiền mặt / ngân hàng / ví điện tử). App không theo dõi tiền đang nằm ở đâu —
 * chỉ cần biết tổng có bao nhiêu. Ví được tạo tự động lúc đăng ký.
 *
 * Vì sao tách thành entity riêng thay vì để trên `User`: số dư là một khái niệm độc lập
 * với hồ sơ người dùng, và nếu sau này cần nhiều ví thì chỉ việc bỏ ràng buộc `@Unique`
 * chứ không phải chuyển cột giữa các bảng.
 *
 * Số dư KHÔNG lưu thành cột — luôn tính ra:
 *   số tiền hiện có = wallet.initialBalance + Σthu − Σchi   (từ startedAt tới nay)
 * Không denormalize → không bao giờ lệch khỏi lịch sử giao dịch.
 */
@Entity('wallets')
@Unique(['userId'])
export class Wallet extends BaseEntity {
  @Column('uuid')
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Tên hiển thị, mặc định "Ví chính". Chủ yếu để giao diện có gì đó mà gọi tên. */
  @Column({ default: 'Ví chính' })
  name: string;

  /**
   * TỔNG TIỀN ĐANG CÓ lúc bắt đầu dùng app — hỏi lúc onboarding:
   * "Hiện tại bạn có tổng cộng bao nhiêu tiền?" (cộng hết tiền mặt + mọi tài khoản).
   *
   * Cần field này vì lịch sử trước khi cài app không được ghi; nếu không thì app chỉ biết
   * CHÊNH LỆCH thu-chi chứ không biết đang cầm bao nhiêu.
   */
  @Column({ type: 'bigint', default: 0, transformer: money })
  initialBalance: number;

  /** Mốc thời gian ứng với `initialBalance`. Giao dịch từ mốc này trở đi mới được cộng dồn. */
  @Column({ type: 'timestamptz', nullable: true })
  startedAt?: Date | null;
}
