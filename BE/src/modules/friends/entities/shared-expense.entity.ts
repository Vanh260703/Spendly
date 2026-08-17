import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { money } from '../../../common/transformers/money.transformer';
import { Category } from '../../categories/entities/category.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { User } from '../../users/entities/user.entity';
import { Contact } from './contact.entity';

/**
 * MỘT LẦN CHI CHUNG — đi ăn, đi chơi mà một người trả trước cho cả nhóm.
 *
 * Hai chiều, phân biệt bằng `payerContactId`:
 * - `null` → **BẠN** trả → tiền rời ví ngay → sinh tối đa 3 giao dịch
 * - có giá trị → **người đó** trả hộ bạn → tiền chưa rời ví bạn → **KHÔNG** sinh giao dịch nào
 *
 * Bất đối xứng này là chủ ý (SPEC §4.6): ghi giao dịch chi lúc bạn ăn ké mà chưa trả sẽ làm
 * số dư tính ra thấp hơn tiền thật trong ví.
 */
@Entity('shared_expenses')
@Index(['userId', 'date'])
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

  /** Tổng hóa đơn, VD 1000000 */
  @Column({ type: 'bigint', transformer: money })
  totalAmount: number;

  @Column({ type: 'timestamptz' })
  date: Date;

  /** VD "Ăn tối sinh nhật Tuấn" */
  @Column({ type: 'varchar', nullable: true })
  note?: string | null;

  /** Danh mục cho phần bạn THỰC ĂN */
  @Column('uuid')
  categoryId: string;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  /**
   * Phần bạn MỜI — tiền bạn tiêu thật, không ai trả lại.
   *
   * Ràng buộc: `treatAmount ≤ phần của bạn`. Chỉ có nghĩa khi BẠN là người trả.
   */
  @Column({ type: 'bigint', transformer: money, default: 0 })
  treatAmount: number;

  /**
   * Danh mục cho phần mời — bắt buộc khi `treatAmount > 0`.
   *
   * Tách khỏi `categoryId` để AI phân biệt được "ăn nhiều" với "mời nhiều": gộp chung thì
   * danh mục Ăn uống phình lên vì tiền mời người khác, và AI sẽ khuyên *ăn ít lại* trong khi
   * vấn đề thật là *mời hơi nhiều*. Hai lời khuyên khác hẳn nhau.
   */
  @Column({ type: 'uuid', nullable: true })
  treatCategoryId?: string | null;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'treatCategoryId' })
  treatCategory?: Category | null;

  /*
   * Ba giao dịch do bản ghi này sinh ra — chỉ khi BẠN là người trả.
   *
   * `RESTRICT`: không cho xóa giao dịch trực tiếp, phải xóa qua `DELETE /shared-expenses/:id`
   * để cả ba biến mất cùng lúc. Xóa lẻ một cái là số dư lệch vĩnh viễn mà không ai biết.
   */

  /** Phần bạn thực ăn — vào thống kê */
  @Column({ type: 'uuid', nullable: true })
  transactionIdMine?: string | null;

  @ManyToOne(() => Transaction, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'transactionIdMine' })
  transactionMine?: Transaction | null;

  /** Phần bạn mời — vào thống kê */
  @Column({ type: 'uuid', nullable: true })
  transactionIdTreat?: string | null;

  @ManyToOne(() => Transaction, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'transactionIdTreat' })
  transactionTreat?: Transaction | null;

  /** Phần cho mượn — danh mục hệ thống, KHÔNG vào thống kê */
  @Column({ type: 'uuid', nullable: true })
  transactionIdLent?: string | null;

  @ManyToOne(() => Transaction, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'transactionIdLent' })
  transactionLent?: Transaction | null;

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
