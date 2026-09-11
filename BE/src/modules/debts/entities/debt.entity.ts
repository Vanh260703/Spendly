import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { money } from '../../../common/transformers/money.transformer';
import { User } from '../../users/entities/user.entity';
import { DebtPayment } from './debt-payment.entity';

export enum DebtStrategy {
  /**
   * "Quả cầu tuyết": dồn tiền trả KHOẢN NHỎ NHẤT trước.
   * Tốn lãi hơn nhưng nhanh thấy kết quả → dễ giữ động lực.
   */
  SNOWBALL = 'snowball',
  /**
   * "Tuyết lở": dồn trả khoản LÃI SUẤT CAO NHẤT trước.
   * Tối ưu về tiền — tổng lãi phải trả ít nhất.
   */
  AVALANCHE = 'avalanche',
}

@Entity('debts')
@Index(['userId', 'isPaid'])
export class Debt extends BaseEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Tên khoản nợ, VD "Vay mua xe" */
  @Column()
  name: string;

  /** Chủ nợ: tên ngân hàng, hoặc tên người quen */
  @Column({ type: 'varchar', nullable: true })
  lender?: string | null;

  /** TIỀN GỐC vay ban đầu, VD 200000000 */
  @Column({ type: 'bigint', transformer: money })
  principal: number;

  /** CÒN NỢ BAO NHIÊU hiện tại. Mỗi lần ghi DebtPayment thì trừ bớt field này. */
  @Column({ type: 'bigint', transformer: money })
  remaining: number;

  /**
   * Lãi suất %/NĂM, VD 9.5.
   * Dùng để tính tổng lãi phải trả và xếp thứ tự ưu tiên khi dùng chiến lược AVALANCHE.
   */
  @Column({ type: 'float' })
  interestRate: number;

  /** Số tiền TỐI THIỂU phải trả mỗi tháng theo hợp đồng */
  @Column({ type: 'bigint', transformer: money })
  minPayment: number;

  /**
   * NGÀY ĐẾN HẠN trong tháng (1–28), VD 15 = phải trả trước ngày 15 hằng tháng.
   * Dùng để nhắc trước vài ngày, tránh trả trễ bị phạt.
   */
  @Column({ type: 'int' })
  dueDay: number;

  @Column({ type: 'enum', enum: DebtStrategy, default: DebtStrategy.AVALANCHE })
  strategy: DebtStrategy;

  /** true = đã trả xong, ẩn khỏi danh sách đang nợ */
  @Column({ default: false })
  isPaid: boolean;

  /** Ngày bắt đầu vay */
  @Column({ type: 'timestamptz' })
  startDate: Date;

  @OneToMany(() => DebtPayment, (p) => p.debt)
  payments: DebtPayment[];
}
