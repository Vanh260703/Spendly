import { z } from 'zod';
import { SettlementDirection } from '../entities/settlement.entity';

const tienDuong = z.coerce.number().int().positive('Số tiền phải lớn hơn 0');
const tienKhongAm = z.coerce.number().int().min(0, 'Số tiền không được âm');

// ————————————————————— Danh bạ —————————————————————

export const createContactSchema = z.object({
  name: z.string().trim().min(1, 'Tên không được để trống').max(100),
  phone: z.string().trim().max(20).optional().nullable(),
  note: z.string().trim().max(255).optional().nullable(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Màu phải dạng #rrggbb')
    .optional(),
});

export const updateContactSchema = createContactSchema.partial().extend({
  isArchived: z.boolean().optional(),
});

export const listContactsSchema = z.object({
  /** Tìm theo tên, không phân biệt hoa thường */
  q: z.string().trim().optional(),
  includeArchived: z.coerce.boolean().default(false),
});

// ————————————————————— Chia bill —————————————————————

const shareSchema = z.object({
  /** `null` = phần của CHÍNH BẠN */
  contactId: z.string().uuid().nullable(),
  amount: tienDuong,
});

export const createSharedExpenseSchema = z
  .object({
    /** `null` = BẠN trả. Có giá trị = người đó trả hộ bạn. */
    payerContactId: z.string().uuid().nullable().default(null),
    totalAmount: tienDuong,
    date: z.coerce.date(),
    note: z.string().trim().max(255).optional().nullable(),
    categoryId: z.string().uuid(),
    treatAmount: tienKhongAm.default(0),
    treatCategoryId: z.string().uuid().optional().nullable(),
    shares: z.array(shareSchema).min(1, 'Phải có ít nhất một phần'),
  })
  /*
   * Bất biến quan trọng nhất của cả tính năng. Lệch một đồng là công nợ sai vĩnh viễn và
   * không có cách nào tự phát hiện về sau — nên chặn ngay ở cửa, kèm cả hai con số để user
   * biết lệch bao nhiêu chứ không phải một câu "dữ liệu không hợp lệ".
   */
  .refine(
    (d) => d.shares.reduce((t, s) => t + s.amount, 0) === d.totalAmount,
    (d) => ({
      message:
        `Tổng các phần (${d.shares.reduce((t, s) => t + s.amount, 0).toLocaleString('vi-VN')}₫) ` +
        `phải bằng hóa đơn (${d.totalAmount.toLocaleString('vi-VN')}₫)`,
      path: ['shares'],
    }),
  )
  // Mỗi người chỉ được một phần; phần của bạn (`contactId: null`) cũng vậy
  .refine(
    (d) => new Set(d.shares.map((s) => s.contactId)).size === d.shares.length,
    { message: 'Mỗi người chỉ được có một phần', path: ['shares'] },
  )
  .refine((d) => d.treatAmount === 0 || !!d.treatCategoryId, {
    message: 'Có phần mời thì phải chọn danh mục cho phần đó',
    path: ['treatCategoryId'],
  })
  /*
   * "Mời" chỉ có nghĩa khi CHÍNH BẠN móc tiền ra. Người khác trả hộ mà lại khai bạn mời thì
   * không biết tiền đó ở đâu ra — chặn sớm còn hơn để sinh giao dịch vô nghĩa.
   */
  .refine((d) => d.payerContactId === null || d.treatAmount === 0, {
    message: 'Người khác trả thì bạn không thể "mời" trong cùng hóa đơn đó',
    path: ['treatAmount'],
  })
  .refine(
    (d) => {
      const cuaBan = d.shares.find((s) => s.contactId === null)?.amount ?? 0;
      return d.treatAmount <= cuaBan;
    },
    { message: 'Phần mời không được lớn hơn phần của bạn', path: ['treatAmount'] },
  );

export const listSharedExpensesSchema = z.object({
  contactId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ————————————————————— Tất toán —————————————————————

export const createSettlementSchema = z
  .object({
    contactId: z.string().uuid(),
    direction: z.nativeEnum(SettlementDirection),
    amount: tienDuong,
    date: z.coerce.date(),
    note: z.string().trim().max(255).optional().nullable(),
    /**
     * Chỉ dùng khi `I_PAID_THEM`: lúc bạn trả lại tiền mới là lúc bạn THỰC SỰ tiêu, nên
     * khoản đó vào danh mục THẬT. Chiều ngược lại đi vào danh mục hệ thống nên không hỏi.
     */
    categoryId: z.string().uuid().optional().nullable(),
  })
  .refine(
    (d) => d.direction !== SettlementDirection.I_PAID_THEM || !!d.categoryId,
    { message: 'Bạn trả lại tiền thì phải chọn danh mục cho khoản chi đó', path: ['categoryId'] },
  );

export type CreateContactDto = z.infer<typeof createContactSchema>;
export type UpdateContactDto = z.infer<typeof updateContactSchema>;
export type ListContactsDto = z.infer<typeof listContactsSchema>;
export type CreateSharedExpenseDto = z.infer<typeof createSharedExpenseSchema>;
export type ListSharedExpensesDto = z.infer<typeof listSharedExpensesSchema>;
export type CreateSettlementDto = z.infer<typeof createSettlementSchema>;

// ————————————————————— Response —————————————————————

export interface ContactDto {
  id: string;
  name: string;
  phone?: string | null;
  note?: string | null;
  color: string;
  isArchived: boolean;
  /** Dương = họ nợ bạn · Âm = bạn nợ họ. Luôn tính bằng SUM(), không đọc cột. */
  balance: number;
}
