import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { money } from '../../../common/transformers/money.transformer';
import { Goal } from './goal.entity';

/**
 * LỊCH SỬ NẠP TIỀN vào mục tiêu — để biết đã bỏ vào lúc nào, bao nhiêu,
 * và vẽ được biểu đồ tiến độ theo thời gian thay vì chỉ một con số.
 */
@Entity('goal_contributions')
@Index(['goalId', 'date'])
export class GoalContribution extends BaseEntity {
  @Column('uuid')
  goalId: string;

  /** Thuộc mục tiêu nào; xóa mục tiêu thì lịch sử xóa theo */
  @ManyToOne(() => Goal, (g) => g.contributions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'goalId' })
  goal: Goal;

  /** Số tiền nạp lần này */
  @Column({ type: 'bigint', transformer: money })
  amount: number;

  /** Ngày nạp */
  @Column({ type: 'timestamptz' })
  date: Date;

  /** Ghi chú, VD "Tiền thưởng tết" */
  @Column({ type: 'varchar', nullable: true })
  note?: string | null;
}
