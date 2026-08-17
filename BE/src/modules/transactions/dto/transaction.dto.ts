import { z } from 'zod';
import { Category } from '../../categories/entities/category.entity';
import { Transaction, TxType } from '../entities/transaction.entity';

const soTien = z
  .number()
  .int('Số tiền phải là số nguyên (đơn vị đồng)')
  .positive('Số tiền phải lớn hơn 0');

export const createTransactionSchema = z.object({
  type: z.nativeEnum(TxType),
  /** LUÔN dương — hướng tiền suy ra từ `type`, không dùng số âm */
  amount: soTien,
  categoryId: z.string().uuid('Danh mục không hợp lệ'),
  date: z.coerce.date(),
  note: z.string().trim().max(500).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
});

/** Không cho sửa `type` — đổi chiều tiền sẽ làm sai số dư và mọi báo cáo lịch sử */
export const updateTransactionSchema = createTransactionSchema
  .omit({ type: true })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Không có gì để cập nhật');

export const listTransactionQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  categoryId: z.string().uuid().optional(),
  type: z.nativeEnum(TxType).optional(),
  /** CSV: `tags=du-lich,cong-viec` */
  tags: z
    .string()
    .transform((s) => s.split(',').map((t) => t.trim()).filter(Boolean))
    .optional(),
  minAmount: z.coerce.number().int().nonnegative().optional(),
  maxAmount: z.coerce.number().int().nonnegative().optional(),
  /** Tìm trong ghi chú */
  q: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const adjustBalanceSchema = z.object({
  /** Số tiền THỰC TẾ user đang có, dùng để tính khoản bù */
  actualBalance: z.number().int().nonnegative('Số tiền không được âm'),
  note: z.string().trim().max(500).optional(),
});

export type CreateTransactionDto = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionDto = z.infer<typeof updateTransactionSchema>;
export type ListTransactionQuery = z.infer<typeof listTransactionQuerySchema>;
export type AdjustBalanceDto = z.infer<typeof adjustBalanceSchema>;

export interface TransactionDto {
  id: string;
  type: TxType;
  amount: number;
  date: Date;
  note: string | null;
  tags: string[];
  category: {
    id: string;
    name: string;
    icon: string;
    color: string;
    kind: string;
  } | null;
}

/** Whitelist tường minh — `walletId`/`userId` là chi tiết nội bộ, không ra API */
export function toTransactionDto(t: Transaction & { category?: Category }): TransactionDto {
  return {
    id: t.id,
    type: t.type,
    amount: t.amount,
    date: t.date,
    note: t.note ?? null,
    tags: t.tags ?? [],
    category: t.category
      ? {
          id: t.category.id,
          name: t.category.name,
          icon: t.category.icon,
          color: t.category.color,
          kind: t.category.kind,
        }
      : null,
  };
}

/**
 * Con trỏ phân trang: mã hóa `(date, id)` của bản ghi cuối trang.
 *
 * Dùng cursor thay vì `OFFSET` vì offset sẽ **nhảy/lặp bản ghi** khi user thêm giao dịch
 * mới trong lúc đang cuộn — mà đó là thao tác thường xuyên nhất của app này.
 * Kèm `id` vì nhiều giao dịch có thể trùng `date` (nhập bù cả ngày), chỉ dựa vào `date`
 * sẽ bỏ sót hoặc lặp.
 */
export function encodeCursor(date: Date, id: string): string {
  return Buffer.from(JSON.stringify({ d: date.toISOString(), i: id })).toString('base64url');
}

export function decodeCursor(cursor: string): { date: Date; id: string } | null {
  try {
    const { d, i } = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
      d: string;
      i: string;
    };
    const date = new Date(d);
    if (Number.isNaN(date.getTime()) || !i) return null;
    return { date, id: i };
  } catch {
    return null;
  }
}
