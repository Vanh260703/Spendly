import { z } from 'zod';
import { Budget, BudgetPeriod } from '../entities/budget.entity';
import { BudgetPeriodResult } from '../entities/budget-period-result.entity';

export const createBudgetSchema = z.object({
  /** null = ngân sách TỔNG, áp cho toàn bộ chi tiêu */
  categoryId: z.string().uuid().nullable().optional(),
  period: z.nativeEnum(BudgetPeriod).default(BudgetPeriod.MONTHLY),
  amount: z.number().int().positive('Hạn mức phải lớn hơn 0'),
  startDate: z.coerce.date().optional(),
  rollover: z.boolean().default(false),
  /** Trần cộng dồn theo tỉ lệ hạn mức gốc. 0.5 = ±50% */
  rolloverCapRatio: z.number().min(0).max(2).default(0.5),
  /** 0.8 = cảnh báo khi đã tiêu 80% */
  alertThreshold: z.number().min(0.1).max(1).default(0.8),
});

export const updateBudgetSchema = createBudgetSchema
  .omit({ categoryId: true })
  .extend({ isActive: z.boolean() })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Không có gì để cập nhật');

export const budgetHistoryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  categoryId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateBudgetDto = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetDto = z.infer<typeof updateBudgetSchema>;
export type BudgetHistoryQuery = z.infer<typeof budgetHistoryQuerySchema>;

export type BudgetStatus = 'ok' | 'warning' | 'exceeded';

export interface BudgetDto {
  id: string;
  category: { id: string; name: string; icon: string; color: string } | null;
  period: BudgetPeriod;
  amount: number;
  rolloverIn: number;
  effectiveAmount: number;
  spent: number;
  remaining: number;
  progress: number;
  status: BudgetStatus;
  rollover: boolean;
  rolloverCapRatio: number;
  alertThreshold: number;
  isActive: boolean;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * `progress` tính trên `effectiveAmount` (đã cộng rollover), **không** phải `amount` gốc.
 * Lấy nhầm mẫu số thì thanh tiến độ và cảnh báo sai đúng bằng phần rollover.
 */
export function toBudgetDto(
  b: Budget,
  calc: { rolloverIn: number; spent: number; periodStart: Date; periodEnd: Date },
): BudgetDto {
  const effectiveAmount = b.amount + calc.rolloverIn;
  const progress = effectiveAmount > 0 ? calc.spent / effectiveAmount : 0;

  return {
    id: b.id,
    category: b.category
      ? {
          id: b.category.id,
          name: b.category.name,
          icon: b.category.icon,
          color: b.category.color,
        }
      : null,
    period: b.period,
    amount: b.amount,
    rolloverIn: calc.rolloverIn,
    effectiveAmount,
    spent: calc.spent,
    remaining: effectiveAmount - calc.spent,
    progress: Number(progress.toFixed(4)),
    status: progress > 1 ? 'exceeded' : progress >= 0.7 ? 'warning' : 'ok',
    rollover: b.rollover,
    rolloverCapRatio: b.rolloverCapRatio,
    alertThreshold: b.alertThreshold,
    isActive: b.isActive,
    periodStart: calc.periodStart,
    periodEnd: calc.periodEnd,
  };
}

export function toBudgetHistoryDto(r: BudgetPeriodResult) {
  return {
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    period: r.period,
    categoryName: r.categoryName ?? null,
    amount: r.amount,
    rolloverIn: r.rolloverIn,
    effectiveAmount: r.effectiveAmount,
    spent: r.spent,
    rolloverOut: r.rolloverOut,
    adherence: r.spent <= r.effectiveAmount,
  };
}
