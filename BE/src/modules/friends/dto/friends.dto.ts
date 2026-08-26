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

/**
 * Ghi một lần chi chung. Hai hình dạng, phân biệt bằng `payerContactId`:
 *
 * - **Bạn trả** (`payerContactId: null`) → bắt buộc có `transactionId`: tiền đã rời tài
 *   khoản và ngân hàng đã báo về, nên KHÔNG tạo giao dịch mới mà **tách giao dịch có sẵn**.
 *   Tạo mới là đếm tiền hai lần.
 * - **Người khác trả** → không có giao dịch nào (tiền chưa rời tài khoản bạn), nên cần
 *   `totalAmount` + `date` khai tay.
 */
export const createSharedExpenseSchema = z
  .object({
    payerContactId: z.string().uuid().nullable().default(null),
    /** Giao dịch ngân hàng cần tách — CHỈ khi bạn là người trả */
    transactionId: z.string().uuid().optional().nullable(),
    /** Chỉ dùng khi người khác trả; bạn trả thì lấy từ giao dịch ngân hàng */
    totalAmount: tienDuong.optional(),
    date: z.coerce.date().optional(),
    note: z.string().trim().max(255).optional().nullable(),
    /**
     * Tùy chọn — giao diện không còn hỏi danh mục.
     *
     * Bỏ trống thì phần của bạn rơi vào `"Chưa phân loại"`. Danh mục giờ chỉ còn một nhiệm
     * vụ duy nhất: tách **tiền cho mượn** ra khỏi tiền tiêu thật, và việc đó app tự làm.
     */
    categoryId: z.string().uuid().optional().nullable(),
    treatAmount: tienKhongAm.default(0),
    treatCategoryId: z.string().uuid().optional().nullable(),
    shares: z.array(shareSchema).min(1, 'Phải có ít nhất một phần'),
  })
  .refine((d) => d.payerContactId !== null || !!d.transactionId, {
    message: 'Bạn trả thì phải chọn giao dịch ngân hàng tương ứng để tách',
    path: ['transactionId'],
  })
  .refine((d) => d.payerContactId === null || (!!d.totalAmount && !!d.date), {
    message: 'Người khác trả thì phải khai số tiền và ngày',
    path: ['totalAmount'],
  })
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
