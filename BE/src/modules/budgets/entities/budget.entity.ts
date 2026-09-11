import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { money } from '../../../common/transformers/money.transformer';
import { Category } from '../../categories/entities/category.entity';
import { User } from '../../users/entities/user.entity';

export enum BudgetPeriod {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

@Entity('budgets')
@Index(['userId', 'isActive'])
export class Budget extends BaseEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /**
   * Đặt hạn mức cho danh mục nào, VD "Ăn uống ≤ 3tr/tháng".
   * null = NGÂN SÁCH TỔNG, áp cho toàn bộ chi tiêu.
   */
  @Column({ type: 'uuid', nullable: true })
  categoryId?: string | null;

  @ManyToOne(() => Category, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category?: Category;

  /** Chu kỳ lặp lại của hạn mức: mỗi tuần hay mỗi tháng */
  @Column({ type: 'enum', enum: BudgetPeriod, default: BudgetPeriod.MONTHLY })
  period: BudgetPeriod;

  /** Hạn mức được tiêu trong một kỳ, VD 3000000 */
  @Column({ type: 'bigint', transformer: money })
  amount: number;

  /** Bắt đầu áp dụng từ khi nào */
  @Column({ type: 'timestamptz' })
  startDate: Date;

  /**
   * Cộng dồn chênh lệch sang kỳ sau, **cả hai chiều**:
   * - Dư  → kỳ sau được cộng thêm  (3tr, tiêu 2.5tr → kỳ sau 3.5tr)
   * - Vượt → kỳ sau bị trừ bớt     (3.5tr, tiêu 3.8tr → kỳ sau 2.7tr)
   *
   * Chỉ cộng khi dư mà không trừ khi vượt sẽ biến ngân sách thành phần thưởng một chiều —
   * tiêu lố không phải trả giá, dùng vài kỳ là hạn mức phồng lên và mất tác dụng kiểm soát.
   *
   * Phần cộng/trừ bị chặn ở `±rolloverCapRatio × amount` (xem dưới).
   * `false` = mỗi kỳ reset về đúng `amount`, dư thì mất.
   */
  @Column({ default: false })
  rollover: boolean;

  /**
   * Trần cộng dồn, tính theo tỉ lệ của `amount` gốc. Mặc định 0.5 = ±50%.
   * Hạn mức 3tr → phần rollover luôn nằm trong [−1.5tr, +1.5tr], tức hạn mức thực tế
   * của một kỳ luôn trong khoảng [1.5tr, 4.5tr].
   *
   * Không có trần thì tiết kiệm vài kỳ liền sẽ đẩy hạn mức lên gấp đôi gấp ba,
   * cảnh báo gần như không bao giờ nổ và ngân sách hết ý nghĩa nhắc nhở.
   * Chỉ có tác dụng khi `rollover = true`.
   */
  @Column({ type: 'float', default: 0.5 })
  rolloverCapRatio: number;

  /**
   * Ngưỡng cảnh báo sớm, tính theo tỉ lệ.
   * 0.8 = báo khi đã tiêu 80% hạn mức, để còn kịp phanh trước khi vượt.
   */
  @Column({ type: 'float', default: 0.8 })
  alertThreshold: number;

  /** false = tạm tắt ngân sách này, không tính và không cảnh báo nữa */
  @Column({ default: true })
  isActive: boolean;
}
