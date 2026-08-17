import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { money } from '../../../common/transformers/money.transformer';
import { User } from '../../users/entities/user.entity';
import { Budget, BudgetPeriod } from './budget.entity';

/**
 * KẾT QUẢ MỘT KỲ NGÂN SÁCH — job chốt lại khi mỗi kỳ đóng.
 *
 * Vì sao cần: `budget.amount` là hạn mức HIỆN TẠI, sửa là ghi đè. Nửa năm sau lương tăng,
 * user đổi hạn mức 3tr → 5tr thì báo cáo tháng 8 năm ngoái sẽ hiển thị hạn mức 5tr — sai,
 * vì lúc đó thực tế là 3tr. Thông tin "hồi đó hạn mức bao nhiêu" mất vĩnh viễn.
 *
 * Bảng này chụp lại `amount` + `spent` tại thời điểm kỳ kết thúc, nên:
 * - Trả lời được "tháng 8/2026 tôi có tiêu trong ngân sách không?"
 * - Chấm được điểm `budgetAdherence` theo thời gian cho health score
 * - Cho AI thấy xu hướng tuân thủ ngân sách, không chỉ ảnh chụp hiện tại
 *
 * Bản ghi TỰ CHỨA ĐỦ THÔNG TIN (snapshot cả `categoryName`) để lịch sử vẫn đọc được
 * sau khi ngân sách hoặc danh mục bị xóa/đổi tên.
 */
@Entity('budget_period_results')
// Mỗi ngân sách chỉ 1 kết quả cho mỗi kỳ — job chạy 2 lần không tạo bản ghi trùng
@Unique(['budgetId', 'periodStart'])
@Index(['userId', 'periodStart'])
export class BudgetPeriodResult extends BaseEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /**
   * Ngân sách nào. `SET NULL` chứ không `CASCADE` — xóa ngân sách thì lịch sử vẫn còn,
   * vì đó chính là lý do tồn tại của bảng này.
   */
  @Column({ type: 'uuid', nullable: true })
  budgetId?: string | null;

  @ManyToOne(() => Budget, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'budgetId' })
  budget?: Budget;

  /** null = ngân sách tổng (áp cho toàn bộ chi tiêu) */
  @Column({ type: 'uuid', nullable: true })
  categoryId?: string | null;

  /**
   * Tên danh mục TẠI THỜI ĐIỂM chốt kỳ — snapshot dạng text.
   * Danh mục có thể bị đổi tên hoặc xóa sau đó; giữ bản sao ở đây để báo cáo cũ
   * vẫn đọc được đúng như lúc nó xảy ra. `null` = ngân sách tổng.
   */
  @Column({ type: 'varchar', nullable: true })
  categoryName?: string | null;

  @Column({ type: 'enum', enum: BudgetPeriod })
  period: BudgetPeriod;

  /** Kỳ chạy từ → đến (đã tính theo `user.monthStartDay`) */
  @Column({ type: 'timestamptz' })
  periodStart: Date;

  @Column({ type: 'timestamptz' })
  periodEnd: Date;

  /**
   * HẠN MỨC GỐC tại thời điểm đó (chưa cộng rollover) — đây là giá trị mà việc ghi đè
   * `budget.amount` sẽ làm mất nếu không có bảng này.
   */
  @Column({ type: 'bigint', transformer: money })
  amount: number;

  /**
   * Chênh lệch mang sang TỪ kỳ trước, **có dấu**: dương = kỳ trước dư, âm = kỳ trước vượt.
   * Đã bị chặn trong khoảng `±rolloverCapRatio × amount`. Bằng 0 khi `rollover = false`.
   */
  @Column({ type: 'bigint', default: 0, transformer: money })
  rolloverIn: number;

  /**
   * Hạn mức THỰC TẾ áp dụng cho kỳ này = `amount + rolloverIn`.
   * Lưu sẵn để báo cáo cũ không phải tính lại, và để thấy ngay kỳ đó được tiêu bao nhiêu.
   */
  @Column({ type: 'bigint', transformer: money })
  effectiveAmount: number;

  /** Số đã tiêu thực tế trong kỳ (đã loại danh mục `isSystem`) */
  @Column({ type: 'bigint', transformer: money })
  spent: number;

  /**
   * Chênh lệch chuyển SANG kỳ sau = `effectiveAmount − spent`, đã áp trần.
   * Chính là `rolloverIn` của bản ghi kỳ kế tiếp — lưu ở đây để lần vết được chuỗi
   * cộng dồn mà không phải tính ngược lại từ đầu.
   */
  @Column({ type: 'bigint', default: 0, transformer: money })
  rolloverOut: number;
}
