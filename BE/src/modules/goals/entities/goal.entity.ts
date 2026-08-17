import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { money } from '../../../common/transformers/money.transformer';
import { User } from '../../users/entities/user.entity';
import { GoalContribution } from './goal-contribution.entity';

export enum GoalHorizon {
  /** NGẮN HẠN, dưới 1 năm: mua laptop, đi du lịch */
  SHORT = 'short',
  /** DÀI HẠN: quỹ dự phòng 6 tháng lương, tiền mua nhà */
  LONG = 'long',
}

export enum GoalStatus {
  /** Đang theo đuổi */
  ACTIVE = 'active',
  /** Đã đạt đủ số tiền */
  ACHIEVED = 'achieved',
  /** Tạm hoãn, giữ nguyên tiến độ */
  PAUSED = 'paused',
  /** Bỏ hẳn */
  CANCELLED = 'cancelled',
}

@Entity('goals')
@Index(['userId', 'status'])
export class Goal extends BaseEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Tên mục tiêu, VD "Mua Macbook", "Quỹ dự phòng" */
  @Column()
  name: string;

  /** Mô tả thêm, lý do đặt mục tiêu */
  @Column({ type: 'varchar', nullable: true })
  description?: string | null;

  /** Ngắn hạn / dài hạn — để tách 2 nhóm trên giao diện */
  @Column({ type: 'enum', enum: GoalHorizon })
  horizon: GoalHorizon;

  /** SỐ TIỀN CẦN ĐẠT, VD 35000000 */
  @Column({ type: 'bigint', transformer: money })
  targetAmount: number;

  /** ĐÃ GOM ĐƯỢC bao nhiêu. Tiến độ hiển thị = currentAmount / targetAmount */
  @Column({ type: 'bigint', default: 0, transformer: money })
  currentAmount: number;

  /**
   * Hạn chót muốn đạt được. Có nó thì app tính được "cần để dành X đồng/tháng mới kịp"
   * và cảnh báo khi đang chậm tiến độ.
   */
  @Column({ type: 'timestamptz', nullable: true })
  deadline?: Date | null;

  /** Số tiền DỰ ĐỊNH trích mỗi tháng — dùng để dự báo ngày hoàn thành */
  @Column({ type: 'bigint', nullable: true, transformer: money })
  monthlyContribution?: number | null;

  @Column({ type: 'enum', enum: GoalStatus, default: GoalStatus.ACTIVE })
  status: GoalStatus;

  /** Tên icon lucide-react, VD "laptop", "plane", "shield" */
  @Column()
  icon: string;

  /** Mã màu hex cho thanh tiến độ */
  @Column()
  color: string;

  /** Danh sách các lần nạp tiền vào mục tiêu này */
  @OneToMany(() => GoalContribution, (c) => c.goal)
  contributions: GoalContribution[];
}
