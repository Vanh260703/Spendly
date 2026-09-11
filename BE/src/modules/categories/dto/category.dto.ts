import { z } from 'zod';
import { Category, CategoryKind, CategoryType } from '../entities/category.entity';

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Màu phải là mã hex 6 ký tự, VD #22c55e');

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Tên danh mục không được để trống').max(60),
  type: z.nativeEnum(CategoryType),
  kind: z.nativeEnum(CategoryKind).default(CategoryKind.NEED),
  icon: z.string().trim().min(1, 'Vui lòng chọn icon').max(50),
  color: hexColor,
  parentId: z.string().uuid().nullable().optional(),
});

/**
 * Không cho sửa `type`.
 *
 * Đổi danh mục từ chi sang thu sẽ khiến mọi giao dịch cũ thuộc nó lệch chiều tiền:
 * một khoản chi bỗng thành khoản thu, số dư và toàn bộ báo cáo lịch sử sai theo.
 * Muốn đổi thì tạo danh mục mới.
 */
export const updateCategorySchema = createCategorySchema
  .omit({ type: true })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Không có gì để cập nhật');

export const listCategoryQuerySchema = z.object({
  type: z.nativeEnum(CategoryType).optional(),
  kind: z.nativeEnum(CategoryKind).optional(),
});

export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;
export type ListCategoryQuery = z.infer<typeof listCategoryQuerySchema>;

export interface CategoryDto {
  id: string;
  name: string;
  type: CategoryType;
  kind: CategoryKind;
  icon: string;
  color: string;
  parentId: string | null;
  isDefault: boolean;
}

/** Whitelist tường minh. `isSystem` không lộ ra ngoài — danh mục hệ thống vốn đã bị lọc. */
export function toCategoryDto(c: Category): CategoryDto {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    kind: c.kind,
    icon: c.icon,
    color: c.color,
    parentId: c.parentId ?? null,
    isDefault: c.isDefault,
  };
}
