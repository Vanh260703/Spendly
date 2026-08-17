import { CategoryKind, CategoryType } from './entities/category.entity';

export interface DefaultCategory {
  name: string;
  type: CategoryType;
  kind: CategoryKind;
  icon: string;
  color: string;
  /** Không cho xóa — là chỗ hứng giao dịch khi danh mục khác bị xóa */
  isDefault?: boolean;
  /** Danh mục kỹ thuật — ẩn khỏi form nhập liệu VÀ khỏi mọi thống kê/prompt AI */
  isSystem?: boolean;
}

/**
 * Danh mục seed sẵn khi tạo tài khoản, để user nhập liệu được ngay mà không phải
 * tự dựng danh mục từ con số 0.
 *
 * `kind` (need/want/saving) là trường quan trọng nhất ở đây: nó quyết định AI được phép
 * đề xuất cắt giảm ở đâu. AI **chỉ** đụng vào `WANT`, không bao giờ khuyên cắt tiền nhà
 * hay thuốc men. Xem `SPEC.md` §4.7.
 */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // ————— CHI: nhu cầu thiết yếu (~50% thu nhập theo khung 50/30/20) —————
  { name: 'Ăn uống', type: CategoryType.EXPENSE, kind: CategoryKind.NEED, icon: 'utensils', color: '#f97316' },
  { name: 'Di chuyển', type: CategoryType.EXPENSE, kind: CategoryKind.NEED, icon: 'car', color: '#3b82f6' },
  { name: 'Hóa đơn & tiện ích', type: CategoryType.EXPENSE, kind: CategoryKind.NEED, icon: 'receipt', color: '#8b5cf6' },
  { name: 'Nhà ở', type: CategoryType.EXPENSE, kind: CategoryKind.NEED, icon: 'house', color: '#14b8a6' },
  { name: 'Sức khỏe', type: CategoryType.EXPENSE, kind: CategoryKind.NEED, icon: 'heart-pulse', color: '#ef4444' },
  { name: 'Giáo dục', type: CategoryType.EXPENSE, kind: CategoryKind.NEED, icon: 'graduation-cap', color: '#6366f1' },

  // ————— CHI: mong muốn, cắt được (~30%) — vùng AI được phép đề xuất cắt —————
  { name: 'Ăn vặt & cà phê', type: CategoryType.EXPENSE, kind: CategoryKind.WANT, icon: 'coffee', color: '#a16207' },
  { name: 'Mua sắm', type: CategoryType.EXPENSE, kind: CategoryKind.WANT, icon: 'shopping-bag', color: '#ec4899' },
  { name: 'Giải trí', type: CategoryType.EXPENSE, kind: CategoryKind.WANT, icon: 'gamepad-2', color: '#a855f7' },
  // Tách khỏi "Ăn uống" để AI phân biệt "ăn nhiều" với "mời nhiều" — hai vấn đề khác nhau,
  // hai lời khuyên khác nhau. `WANT` vì đây là khoản cắt được (SPEC §4.6).
  { name: 'Mời bạn bè', type: CategoryType.EXPENSE, kind: CategoryKind.WANT, icon: 'gift', color: '#f43f5e' },

  // ————— CHI: tiết kiệm / trả nợ (~20%) —————
  { name: 'Trả nợ', type: CategoryType.EXPENSE, kind: CategoryKind.SAVING, icon: 'landmark', color: '#0891b2' },

  { name: 'Khác', type: CategoryType.EXPENSE, kind: CategoryKind.NEED, icon: 'circle-ellipsis', color: '#64748b', isDefault: true },

  // ————— THU —————
  { name: 'Lương', type: CategoryType.INCOME, kind: CategoryKind.NEED, icon: 'wallet', color: '#22c55e' },
  { name: 'Thưởng', type: CategoryType.INCOME, kind: CategoryKind.NEED, icon: 'gift', color: '#16a34a' },
  { name: 'Freelance', type: CategoryType.INCOME, kind: CategoryKind.NEED, icon: 'laptop', color: '#0ea5e9' },
  { name: 'Đầu tư', type: CategoryType.INCOME, kind: CategoryKind.NEED, icon: 'trending-up', color: '#eab308' },
  { name: 'Được tặng', type: CategoryType.INCOME, kind: CategoryKind.NEED, icon: 'heart', color: '#db2777' },
  { name: 'Khác', type: CategoryType.INCOME, kind: CategoryKind.NEED, icon: 'circle-ellipsis', color: '#64748b', isDefault: true },

  // ————— HỆ THỐNG —————
  // Cần CẢ HAI chiều vì `adjust-balance` có thể sinh giao dịch thu (app tính thiếu)
  // hoặc chi (app tính thừa), mà một Category chỉ mang được một `type`.
  { name: 'Điều chỉnh số dư', type: CategoryType.INCOME, kind: CategoryKind.NEED, icon: 'scale', color: '#94a3b8', isSystem: true },
  { name: 'Điều chỉnh số dư', type: CategoryType.EXPENSE, kind: CategoryKind.NEED, icon: 'scale', color: '#94a3b8', isSystem: true },
  // Hứng phần tiền TRẢ HỘ người khác — không phải bạn tiêu, nên phải nằm ngoài mọi thống kê
  // và prompt AI. Cũng cần cả hai chiều: chi khi bạn ứng tiền, thu khi họ trả lại.
  { name: 'Trả hộ bạn bè', type: CategoryType.INCOME, kind: CategoryKind.NEED, icon: 'users', color: '#94a3b8', isSystem: true },
  { name: 'Trả hộ bạn bè', type: CategoryType.EXPENSE, kind: CategoryKind.NEED, icon: 'users', color: '#94a3b8', isSystem: true },
];

/** Tên các danh mục hệ thống — tra bằng hằng số, đừng gõ chuỗi rải rác trong service */
export const SYSTEM_CATEGORY = {
  DIEU_CHINH_SO_DU: 'Điều chỉnh số dư',
  TRA_HO_BAN_BE: 'Trả hộ bạn bè',
} as const;
