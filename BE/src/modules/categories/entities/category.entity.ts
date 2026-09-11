import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

export enum CategoryType {
  /** Danh mục tiền vào */
  INCOME = 'income',
  /** Danh mục tiền ra */
  EXPENSE = 'expense',
}

/**
 * Phân loại theo khung 50/30/20 — đầu vào quan trọng nhất cho phân tích AI.
 * AI CHỈ được đề xuất cắt giảm ở `WANT`, không bao giờ ở `NEED`/`SAVING`.
 */
export enum CategoryKind {
  /** NHU CẦU thiết yếu: tiền nhà, điện nước, ăn cơ bản, đi làm (mục tiêu ~50% thu nhập) */
  NEED = 'need',
  /** MONG MUỐN, cắt được: cà phê, xem phim, mua sắm không cần thiết (~30%) */
  WANT = 'want',
  /** TIẾT KIỆM / trả nợ (~20%) */
  SAVING = 'saving',
}

@Entity('categories')
@Index(['userId', 'type'])
export class Category extends BaseEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Tên danh mục, VD "Ăn uống", "Lương" */
  @Column()
  name: string;

  /** Thu hay chi — form nhập liệu lọc theo field này */
  @Column({ type: 'enum', enum: CategoryType })
  type: CategoryType;

  /**
   * Cần / muốn / tiết kiệm. Nhờ có nó, app trả lời được câu
   * "bao nhiêu % tiền tôi tiêu là thứ có thể cắt bỏ?"
   */
  @Column({ type: 'enum', enum: CategoryKind, default: CategoryKind.NEED })
  kind: CategoryKind;

  /** Tên icon lucide-react, VD "utensils" (ăn uống), "coffee" (cà phê) */
  @Column()
  icon: string;

  /** Mã màu hex — cũng là màu của danh mục này trong biểu đồ tròn */
  @Column()
  color: string;

  /**
   * ID danh mục cha, để làm danh mục 2 cấp.
   * VD "Ăn uống" (cha) → "Ăn ngoài" / "Đi chợ" (con). null = danh mục cấp 1.
   */
  @Column({ type: 'uuid', nullable: true })
  parentId?: string | null;

  /**
   * true = danh mục hệ thống seed sẵn khi tạo tài khoản.
   * Dùng để chặn user xóa mất danh mục "Khác" — chỗ hứng giao dịch khi một danh mục khác bị xóa.
   */
  @Column({ default: false })
  isDefault: boolean;

  /**
   * true = danh mục KỸ THUẬT, bị loại khỏi MỌI thống kê và prompt AI.
   *
   * Hiện chỉ dùng cho "Điều chỉnh số dư" — giao dịch bù chênh lệch không phải khoản thu/chi
   * thật. Quên lọc là AI sẽ hiểu nhầm bút toán bù thành khoản chi thật và khuyên sai.
   * Không hiện trong form nhập liệu thường.
   */
  @Column({ default: false })
  isSystem: boolean;
}
