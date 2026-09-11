import { z } from 'zod';
import { Debt, DebtStrategy } from '../entities/debt.entity';

export const createDebtSchema = z.object({
  name: z.string().trim().min(1, 'Tên khoản nợ không được để trống').max(100),
  lender: z.string().trim().max(100).nullable().optional(),
  principal: z.number().int().positive('Tiền gốc phải lớn hơn 0'),
  /** Bỏ trống = còn nợ đúng bằng tiền gốc (khoản vay mới) */
  remaining: z.number().int().nonnegative().optional(),
  interestRate: z.number().min(0).max(100, 'Lãi suất %/năm không hợp lệ'),
  minPayment: z.number().int().positive('Mức trả tối thiểu phải lớn hơn 0'),
  /** Ngày đến hạn trong tháng — giới hạn 28 để tháng 2 luôn có ngày này */
  dueDay: z.number().int().min(1).max(28),
  strategy: z.nativeEnum(DebtStrategy).default(DebtStrategy.AVALANCHE),
  startDate: z.coerce.date().optional(),
});

export const updateDebtSchema = createDebtSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Không có gì để cập nhật');

export const payDebtSchema = z.object({
  amount: z.number().int().positive('Số tiền trả phải lớn hơn 0'),
  date: z.coerce.date().default(() => new Date()),
});

export const payoffPlanQuerySchema = z.object({
  strategy: z.nativeEnum(DebtStrategy).default(DebtStrategy.AVALANCHE),
  /** Số tiền trả THÊM mỗi tháng ngoài mức tối thiểu — đây là đòn bẩy chính của cả 2 chiến lược */
  extraPayment: z.coerce.number().int().nonnegative().default(0),
});

export type CreateDebtDto = z.infer<typeof createDebtSchema>;
export type UpdateDebtDto = z.infer<typeof updateDebtSchema>;
export type PayDebtDto = z.infer<typeof payDebtSchema>;
export type PayoffPlanQuery = z.infer<typeof payoffPlanQuerySchema>;

export function toDebtDto(d: Debt) {
  return {
    id: d.id,
    name: d.name,
    lender: d.lender ?? null,
    principal: d.principal,
    remaining: d.remaining,
    paid: d.principal - d.remaining,
    progress:
      d.principal > 0
        ? Number(((d.principal - d.remaining) / d.principal).toFixed(4))
        : 0,
    interestRate: d.interestRate,
    minPayment: d.minPayment,
    dueDay: d.dueDay,
    strategy: d.strategy,
    isPaid: d.isPaid,
    startDate: d.startDate,
  };
}
