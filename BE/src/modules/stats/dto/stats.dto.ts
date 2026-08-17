import { z } from 'zod';
import { TxType } from '../../transactions/entities/transaction.entity';

/**
 * Chọn kỳ: hoặc `period` (today/week/month — BE tự tính theo `monthStartDay` và múi giờ
 * của user), hoặc `from`+`to` tùy ý. Mặc định `month`.
 */
export const rangeQuerySchema = z
  .object({
    period: z.enum(['today', 'week', 'month']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    /** Chỉ dùng nội bộ (job báo cáo): nói rõ khoảng from/to là kỳ tuần hay tháng */
    periodKind: z.enum(['today', 'week', 'month']).optional(),
  })
  .refine((d) => !(d.from && !d.to) && !(d.to && !d.from), 'Phải có cả `from` và `to`');

export const byCategoryQuerySchema = rangeQuerySchema.and(
  z.object({ type: z.nativeEnum(TxType).default(TxType.EXPENSE) }),
);

export const trendQuerySchema = rangeQuerySchema.and(
  z.object({ groupBy: z.enum(['day', 'week', 'month']).default('day') }),
);

export const calendarQuerySchema = z.object({
  /** `2026-08` */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Định dạng tháng phải là YYYY-MM')
    .optional(),
});

export type RangeQuery = z.infer<typeof rangeQuerySchema>;
export type ByCategoryQuery = z.infer<typeof byCategoryQuerySchema>;
export type TrendQuery = z.infer<typeof trendQuerySchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
