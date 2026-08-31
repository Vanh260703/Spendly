import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { money } from '../../../common/transformers/money.transformer';
import { User } from '../../users/entities/user.entity';
import { Contact } from './contact.entity';

export enum SettlementDirection {
  /** Họ trả lại tiền cho bạn → công nợ giảm đi */
  THEY_PAID_ME = 'they_paid_me',
  /** Bạn trả lại tiền cho họ → công nợ của bạn giảm đi */
  I_PAID_THEM = 'i_paid_them',
}

/**
 * MỘT LẦN TRẢ NỢ — ghi lại việc tiền đã được trả lại.
 *
 * ⚠️ **KHÔNG tạo `Transaction`.** Trả nợ qua chuyển khoản thì ngân hàng đã báo về rồi; tạo
 * thêm một dòng nữa là đếm tiền hai lần. Còn trả tiền mặt thì không có gì để ngân hàng báo.
 * Cả hai trường hợp, bảng này chỉ ghi **công nợ đã dịch chuyển bao nhiêu**.
 *
 * Cho phép trả **từng phần** (nhiều bản ghi cho cùng một người) và trả **dư** (công nợ đổi
 * dấu). Không chặn — đời thật vẫn xảy ra và chặn chỉ làm user phải nói dối dữ liệu.
 */
@Entity('settlements')
@Index(['userId', 'contactId', 'date'])
export class Settlement extends BaseEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid')
  contactId: string;

  // Xóa người trong danh bạ không được làm bay mất lịch sử trả tiền.
  // Service vẫn chặn xóa khi công nợ khác 0 — đây là lớp phòng thủ thứ hai.
  @ManyToOne(() => Contact, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'contactId' })
  contact?: Contact | null;

  @Column({ type: 'enum', enum: SettlementDirection })
  direction: SettlementDirection;

  /**
   * LUÔN DƯƠNG — hướng tiền suy ra từ `direction`.
   *
   * Theo đúng quy ước đã dùng cho `Transaction.type`: không bao giờ lưu số âm để biểu thị
   * chiều, vì rồi sẽ có chỗ quên `Math.abs()`.
   */
  @Column({ type: 'bigint', transformer: money })
  amount: number;

  @Column({ type: 'timestamptz' })
  date: Date;

  @Column({ type: 'varchar', nullable: true })
  note?: string | null;
}
