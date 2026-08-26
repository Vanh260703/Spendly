import { CategoryType } from './entities/category.entity';

export interface DefaultCategory {
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  /** Không cho xóa — là chỗ hứng giao dịch khi danh mục khác bị xóa */
  isDefault?: boolean;
  /** Danh mục kỹ thuật — ẩn khỏi form nhập liệu VÀ khỏi mọi thống kê/prompt AI */
  isSystem?: boolean;
}

/**
 * Danh mục seed sẵn khi tạo tài khoản, để user dùng được ngay mà không phải dựng từ số 0.
 *
 * Giao dịch về từ ngân hàng KHÔNG kèm danh mục — chúng rơi vào `"Chưa phân loại"` rồi user
 * tự gán. Vì vậy danh sách này cần phủ đủ các nhóm chi thường gặp để việc gán chỉ là một
 * cú bấm, không phải tạo danh mục mới mỗi lần.
 */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // ————— CHI: thiết yếu —————
  { name: 'Ăn uống', type: CategoryType.EXPENSE, icon: 'utensils', color: '#f97316' },
  { name: 'Di chuyển', type: CategoryType.EXPENSE, icon: 'car', color: '#3b82f6' },
  { name: 'Hóa đơn & tiện ích', type: CategoryType.EXPENSE, icon: 'receipt', color: '#8b5cf6' },
  { name: 'Nhà ở', type: CategoryType.EXPENSE, icon: 'house', color: '#14b8a6' },
  { name: 'Sức khỏe', type: CategoryType.EXPENSE, icon: 'heart-pulse', color: '#ef4444' },
  { name: 'Giáo dục', type: CategoryType.EXPENSE, icon: 'graduation-cap', color: '#6366f1' },

  // ————— CHI: mong muốn —————
  { name: 'Ăn vặt & cà phê', type: CategoryType.EXPENSE, icon: 'coffee', color: '#a16207' },
  { name: 'Mua sắm', type: CategoryType.EXPENSE, icon: 'shopping-bag', color: '#ec4899' },
  { name: 'Giải trí', type: CategoryType.EXPENSE, icon: 'gamepad-2', color: '#a855f7' },
  // Tách khỏi "Ăn uống" để nhìn ra được "ăn nhiều" hay "mời nhiều" — hai chuyện khác nhau
  { name: 'Mời bạn bè', type: CategoryType.EXPENSE, icon: 'gift', color: '#f43f5e' },

  // ————— CHI: tiết kiệm / trả nợ —————
  { name: 'Trả nợ', type: CategoryType.EXPENSE, icon: 'landmark', color: '#0891b2' },

  { name: 'Khác', type: CategoryType.EXPENSE, icon: 'circle-ellipsis', color: '#64748b', isDefault: true },

  // ————— CHỖ HỨNG giao dịch mới về từ ngân hàng —————
  // Ngân hàng không cho biết danh mục, nên mọi giao dịch mới rơi vào đây rồi user tự gán.
  // `isSystem` để nó KHÔNG chiếm một lát trong biểu đồ theo danh mục (lát đó vô nghĩa),
  // nhưng tiền vẫn tính vào TỔNG chi/thu vì đã đi thật.
  { name: 'Chưa phân loại', type: CategoryType.EXPENSE, icon: 'circle-help', color: '#94a3b8', isSystem: true },
  { name: 'Chưa phân loại', type: CategoryType.INCOME, icon: 'circle-help', color: '#94a3b8', isSystem: true },

  // ————— THU —————
  { name: 'Lương', type: CategoryType.INCOME, icon: 'wallet', color: '#22c55e' },
  { name: 'Thưởng', type: CategoryType.INCOME, icon: 'gift', color: '#16a34a' },
  { name: 'Freelance', type: CategoryType.INCOME, icon: 'laptop', color: '#0ea5e9' },
  { name: 'Đầu tư', type: CategoryType.INCOME, icon: 'trending-up', color: '#eab308' },
  { name: 'Được tặng', type: CategoryType.INCOME, icon: 'heart', color: '#db2777' },
  { name: 'Khác', type: CategoryType.INCOME, icon: 'circle-ellipsis', color: '#64748b', isDefault: true },

  // ————— HỆ THỐNG —————
  // Hứng phần tiền TRẢ HỘ người khác — không phải bạn tiêu, nên phải nằm ngoài mọi thống kê
  // và prompt AI. Cũng cần cả hai chiều: chi khi bạn ứng tiền, thu khi họ trả lại.
  { name: 'Trả hộ bạn bè', type: CategoryType.INCOME, icon: 'users', color: '#94a3b8', isSystem: true },
  { name: 'Trả hộ bạn bè', type: CategoryType.EXPENSE, icon: 'users', color: '#94a3b8', isSystem: true },
];

/** Tên các danh mục hệ thống — tra bằng hằng số, đừng gõ chuỗi rải rác trong service */
export const SYSTEM_CATEGORY = {
  TRA_HO_BAN_BE: 'Trả hộ bạn bè',
  CHUA_PHAN_LOAI: 'Chưa phân loại',
} as const;
