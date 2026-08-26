import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { money } from '../../../common/transformers/money.transformer';
import { User } from '../../users/entities/user.entity';

/**
 * TÀI KHOẢN NGÂN HÀNG đã liên kết qua SePay.
 *
 * Thay cho `Wallet` cũ. Khác biệt cốt lõi: ví cũ là thứ user tự khai số dư ban đầu rồi app
 * cộng trừ dần; tài khoản này thì **ngân hàng là nguồn sự thật** — mỗi webhook mang theo
 * `accumulated` là số dư thật sau giao dịch.
 *
 * ⚠️ `currentBalance` là **bản sao của một sự thật BÊN NGOÀI**, không phải denormalize giá
 * trị do app tự tính. Đây là khác biệt quan trọng: quy tắc "không lưu cột balance" (SPEC §7)
 * sinh ra để chặn việc app tự cộng dồn rồi lệch khỏi lịch sử của chính nó. Ở đây con số do
 * ngân hàng cấp, app chỉ chép lại — tự cộng trừ mới là sai.
 */
@Entity('bank_accounts')
@Unique(['accountNumber'])
@Index(['userId'])
export class BankAccount extends BaseEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /**
   * Số tài khoản — **khóa để tra webhook về của ai**.
   *
   * `@Unique` toàn cục (không phải theo user): một số tài khoản chỉ thuộc về một người.
   * Trùng nghĩa là có người khai nhầm, và nếu cho qua thì giao dịch của người này sẽ chạy
   * vào sổ của người kia.
   */
  @Column()
  accountNumber: string;

  /** Tên ngân hàng SePay gửi trong `gateway`, VD "MBBank" */
  @Column()
  bankName: string;

  /** Tên tự đặt cho dễ nhận, VD "Tài khoản chính" */
  @Column({ default: 'Tài khoản chính' })
  nickname: string;

  /**
   * Số dư mới nhất — lấy từ `accumulated` của webhook gần nhất.
   *
   * Không tự cộng trừ. Webhook nào về sau thì con số đó thắng.
   */
  @Column({ type: 'bigint', default: 0, transformer: money })
  currentBalance: number;

  /** Lần cuối nhận được webhook — im lặng quá lâu là dấu hiệu liên kết SePay hỏng */
  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt?: Date | null;
}
