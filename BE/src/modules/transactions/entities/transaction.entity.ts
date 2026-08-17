import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { money } from '../../../common/transformers/money.transformer';
import { Category } from '../../categories/entities/category.entity';
import { User } from '../../users/entities/user.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';

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
 * `walletId` do BE tự điền. Càng ít trường phải nhập thì càng dễ giữ thói quen ghi mỗi ngày.
 */
@Entity('transactions')
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
  walletId: string;

  @ManyToOne(() => Wallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;

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
   * Nhãn phụ để lọc chéo danh mục, VD ["du-lich-da-lat", "cong-viec"].
   * Một giao dịch chỉ có 1 danh mục nhưng có nhiều tag.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  tags: string[];
}
