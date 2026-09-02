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

/** ~1.4MB base64 ≈ ảnh gốc 1MB — quá đủ cho một mã QR, và chặn được ảnh chụp màn hình 4K */
const GIOI_HAN_QR = 1_400_000;

export const updateContactSchema = createContactSchema.partial().extend({
  isArchived: z.boolean().optional(),
  /**
   * Ảnh QR dạng data URI. `null` để xóa ảnh.
   *
   * Chỉ nhận `image/*` — không nhận `text/html` hay `image/svg+xml`, vì SVG chứa được
   * `<script>` và trình duyệt sẽ chạy nó khi ảnh được mở trực tiếp.
   */
  qrImage: z
    .string()
    .max(GIOI_HAN_QR, 'Ảnh quá lớn — hãy dùng ảnh dưới 1MB')
    .regex(
      /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/,
      'Ảnh không hợp lệ (chỉ nhận PNG, JPEG, WebP, GIF)',
    )
    .nullable()
    .optional(),
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
/**
 * Ghi một lần chi chung. Ba hình dạng:
 *
 * - **Bạn trả qua ngân hàng** → có `transactionId`. App **không sửa gì** ở giao dịch đó,
 *   chỉ ghi công nợ và lấy số tiền/ngày từ nó.
 * - **Bạn trả tiền mặt** → không `transactionId`, khai `totalAmount` + `date`.
 * - **Người khác trả hộ bạn** → có `payerContactId`, cũng khai tay số tiền + ngày.
 */
export const createSharedExpenseSchema = z
  .object({
    payerContactId: z.string().uuid().nullable().default(null),
    /** Giao dịch ngân hàng tương ứng — chỉ để tham chiếu, KHÔNG bị sửa */
    transactionId: z.string().uuid().optional().nullable(),
    /** Bắt buộc khi không gắn với giao dịch ngân hàng */
    totalAmount: tienDuong.optional(),
    date: z.coerce.date().optional(),
    note: z.string().trim().max(255).optional().nullable(),
    shares: z.array(shareSchema).min(1, 'Phải có ít nhất một phần'),
  })
  .refine((d) => !!d.transactionId || (!!d.totalAmount && !!d.date), {
    message: 'Không gắn giao dịch ngân hàng thì phải khai số tiền và ngày',
    path: ['totalAmount'],
  })
  // Người khác trả thì tiền không đi qua tài khoản bạn — không có giao dịch nào để gắn
  .refine((d) => d.payerContactId === null || !d.transactionId, {
    message: 'Người khác trả thì không gắn được với giao dịch ngân hàng của bạn',
    path: ['transactionId'],
  })
  // Mỗi người chỉ được một phần; phần của bạn (`contactId: null`) cũng vậy
  .refine(
    (d) => new Set(d.shares.map((s) => s.contactId)).size === d.shares.length,
    { message: 'Mỗi người chỉ được có một phần', path: ['shares'] },
  );

export const listSharedExpensesSchema = z.object({
  contactId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ————————————————————— Tất toán —————————————————————

export const createSettlementSchema = z.object({
  contactId: z.string().uuid(),
  direction: z.nativeEnum(SettlementDirection),
  amount: tienDuong,
  date: z.coerce.date(),
  note: z.string().trim().max(255).optional().nullable(),
});

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
  /** CHỈ có ở endpoint chi tiết — danh sách không kèm để khỏi tải hàng trăm KB mỗi lần */
  qrImage?: string | null;
}
