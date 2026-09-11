import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { money } from '../../../common/transformers/money.transformer';
import { Debt } from './debt.entity';

/**
 * LỊCH SỬ TRẢ NỢ — mỗi lần trả một bản ghi, để đối chiếu `debt.remaining`
 * và vẽ biểu đồ nợ giảm dần.
 */
@Entity('debt_payments')
@Index(['debtId', 'date'])
export class DebtPayment extends BaseEntity {
  @Column('uuid')
  debtId: string;

  @ManyToOne(() => Debt, (d) => d.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'debtId' })
  debt: Debt;

  /** Số tiền trả lần này */
  @Column({ type: 'bigint', transformer: money })
  amount: number;

  /** Ngày trả */
  @Column({ type: 'timestamptz' })
  date: Date;
}
