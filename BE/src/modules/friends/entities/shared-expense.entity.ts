import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { money } from '../../../common/transformers/money.transformer';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { User } from '../../users/entities/user.entity';
import { Contact } from './contact.entity';

/**
 * MỘT LẦN CHI CHUNG — đi ăn, đi chơi mà một người trả trước cho cả nhóm.
 *
 * ⚠️ **KHÔNG đụng vào bảng `transactions`.** Đó là bản sao nguyên vẹn những gì ngân hàng
 * báo về; app không được cắt nhỏ, đổi số tiền hay thêm dòng vào đó. Trước đây việc chia bill
 * tách giao dịch gốc thành nhiều dòng con — nghĩa là sổ ngân hàng trong app không còn khớp
 * với sao kê thật, và mất luôn khả năng đối chiếu khi có tranh chấp.
 *
 * Giờ chia bill chỉ ghi vào ĐÂY. Bảng này trả lời "ai nợ tôi bao nhiêu"; bảng `transactions`
 * trả lời "ngân hàng đã ghi nhận những gì". Hai câu hỏi khác nhau, hai bảng riêng.
 *
 * Hai chiều, phân biệt bằng `payerContactId`:
 * - `null` → **BẠN** trả (thường gắn với một giao dịch ngân hàng qua `transactionId`)
 * - có giá trị → **người đó** trả hộ bạn, không có giao dịch nào của bạn cả
 */
@Entity('shared_expenses')
@Index(['userId', 'date'])
// Một giao dịch ngân hàng chỉ được chia MỘT lần — chia hai lần là công nợ nhân đôi
@Unique(['transactionId'])
export class SharedExpense extends BaseEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** NULL = BẠN là người trả. Có giá trị = người đó trả hộ bạn. */
  @Column({ type: 'uuid', nullable: true })
  payerContactId?: string | null;

  // Xóa người trong danh bạ không được làm bay mất lịch sử chi tiêu — nên SET NULL.
  // Dù vậy service vẫn CHẶN xóa khi công nợ khác 0; đây là lớp phòng thủ thứ hai.
  @ManyToOne(() => Contact, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'payerContactId' })
  payer?: Contact | null;

  /**
   * Giao dịch ngân hàng tương ứng — **chỉ để tham chiếu, KHÔNG bị sửa gì**.
   *
   * `null` khi khoản chi chung không đi qua tài khoản: bạn trả tiền mặt, hoặc người khác
   * trả hộ bạn.
   *
   * `SET NULL` chứ không `CASCADE`: xóa giao dịch không được làm mất công nợ — người ta vẫn
   * đang nợ bạn thật, dù bản ghi ngân hàng có còn hay không.
   */
  @Column({ type: 'uuid', nullable: true })
  transactionId?: string | null;

  @ManyToOne(() => Transaction, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'transactionId' })
  transaction?: Transaction | null;

  /** Tổng hóa đơn, VD 1000000 */
  @Column({ type: 'bigint', transformer: money })
  totalAmount: number;

  @Column({ type: 'timestamptz' })
  date: Date;

  /** VD "Ăn tối sinh nhật Tuấn" */
  @Column({ type: 'varchar', nullable: true })
  note?: string | null;

  @OneToMany(() => SharedExpenseShare, (s) => s.sharedExpense)
  shares: SharedExpenseShare[];
}

/**
 * PHẦN CỦA TỪNG NGƯỜI trong một lần chi chung.
 *
 * ⚠️ **Bất biến: `Σ amount của mọi share = totalAmount`.** Lệch một đồng là công nợ sai vĩnh
 * viễn và không có cách nào tự phát hiện. Kiểm ở service, không tin client.
 */
@Entity('shared_expense_shares')
@Unique(['sharedExpenseId', 'contactId'])
export class SharedExpenseShare extends BaseEntity {
  @Column('uuid')
  sharedExpenseId: string;

  @ManyToOne(() => SharedExpense, (e) => e.shares, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sharedExpenseId' })
  sharedExpense: SharedExpense;

  /** NULL = phần của BẠN */
  @Column({ type: 'uuid', nullable: true })
  contactId?: string | null;

  @ManyToOne(() => Contact, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'contactId' })
  contact?: Contact | null;

  @Column({ type: 'bigint', transformer: money })
  amount: number;
}
