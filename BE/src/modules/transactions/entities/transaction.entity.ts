import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { money } from '../../../common/transformers/money.transformer';
import { Category } from '../../categories/entities/category.entity';
import { User } from '../../users/entities/user.entity';
import { BankAccount } from '../../bank-accounts/entities/bank-account.entity';

export enum TxType {
  /** Tiền vào */
  INCOME = 'income',
  /** Tiền ra */
  EXPENSE = 'expense',
}

/**
 * Giao dịch — trái tim của app.
 *
 * Mô hình cố ý tối giản: chỉ **một ví chung** (xem `Wallet`), không chia loại ví,
 * không có chuyển tiền nội bộ. Với người dùng, một giao dịch = số tiền + danh mục + ngày;
 * `bankAccountId` do webhook điền — giao dịch đến từ ngân hàng, không ai gõ tay.
 */
@Entity('transactions')
// Chống trùng khi SePay gọi lại cùng một giao dịch. NULL không đụng nhau trong Postgres,
// nên các dòng con (sepayId = null) không bị ràng buộc này chặn — đúng ý muốn.
@Unique(['userId', 'sepayId'])
// Cho màn hình danh sách + lọc theo khoảng ngày
@Index(['userId', 'date'])
// Cho biểu đồ chi theo danh mục
@Index(['userId', 'categoryId', 'date'])
export class Transaction extends BaseEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /**
   * Ví chung của user. Hiện mỗi user chỉ có đúng 1 ví nên BE tự điền, client không gửi lên.
   * Có sẵn cột này để sau muốn hỗ trợ nhiều ví thì chỉ cần bỏ `@Unique(['userId'])`
   * trên `Wallet`, không phải migrate lại bảng giao dịch.
   */
  @Column('uuid')
  bankAccountId: string;

  @ManyToOne(() => BankAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bankAccountId' })
  bankAccount: BankAccount;

  /**
   * Thuộc danh mục nào — BẮT BUỘC.
   * Toàn bộ phân tích và gợi ý của AI đều dựa trên danh mục; giao dịch không danh mục
   * là dữ liệu chết.
   *
   * `onDelete: 'RESTRICT'` để không thể xóa danh mục đang có giao dịch — service phải
   * chuyển các giao dịch đó về "Khác" trước, xem SPEC §7.
   */
  @Column('uuid')
  categoryId: string;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  /** Thu hay chi */
  @Column({ type: 'enum', enum: TxType })
  type: TxType;

  /**
   * Số tiền, LUÔN LƯU SỐ DƯƠNG.
   * Hướng tiền suy ra từ `type` — không dùng số âm, tránh nhầm lẫn khi cộng dồn.
   */
  @Column({ type: 'bigint', transformer: money })
  amount: number;

  /**
   * Thời điểm giao dịch XẢY RA (do user chọn — có thể nhập bù cho hôm qua).
   * Khác với `createdAt` là lúc bấm lưu. Mọi báo cáo dùng field này.
   */
  @Column({ type: 'timestamptz' })
  date: Date;

  /** Ghi chú tự do, VD "Ăn trưa với team" */
  @Column({ type: 'varchar', nullable: true })
  note?: string | null;

  /**
   * `id` của giao dịch bên SePay — **khóa chống trùng**.
   *
   * SePay gọi lại webhook khi không nhận được 2xx, nên cùng một giao dịch có thể đến nhiều
   * lần. Không có khóa này thì mỗi lần gọi lại là một dòng mới và số dư phồng lên vô hình.
   *
   * `null` với giao dịch KHÔNG đến từ ngân hàng — cụ thể là các dòng con sinh ra khi tách
   * một hóa đơn chia cho bạn bè.
   */
  @Column({ type: 'int', nullable: true })
  sepayId?: number | null;

  /** Mã tham chiếu ngân hàng — để đối chiếu với sao kê khi có tranh chấp */
  @Column({ type: 'varchar', nullable: true })
  referenceCode?: string | null;

  /**
   * Đã XÉT dòng này chưa — `null` = chưa.
   *
   * Giao dịch từ ngân hàng về không tự nói cho biết nó có phần trả hộ người khác hay không;
   * chỉ mình bạn biết bữa đó mấy người. Không có cờ này thì không có cách nào trả lời câu
   * **"tôi còn sót khoản nào chưa chia không?"** — một khoản bị quên sẽ âm thầm tính hết
   * vào tiền bạn tiêu, và người kia không bao giờ được ghi là đang nợ.
   *
   * Lưu MỐC THỜI GIAN chứ không phải `boolean`: cùng một cột, biết thêm được đã xét lúc nào.
   */
  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt?: Date | null;

  /**
   * Nhãn phụ để lọc chéo danh mục, VD ["du-lich-da-lat", "cong-viec"].
   * Một giao dịch chỉ có 1 danh mục nhưng có nhiều tag.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  tags: string[];
}
