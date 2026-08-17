import { z } from 'zod';
import { InsightKind } from '../entities/ai-insight.entity';

export const necessityQuerySchema = z.object({
  period: z.enum(['week', 'month']).default('week'),
});

export const listInsightQuerySchema = z.object({
  kind: z.nativeEnum(InsightKind).optional(),
  /** `weekly,monthly` — lọc nhiều loại cùng lúc cho trang "Báo cáo chi tiêu" */
  kinds: z
    .string()
    .transform((s) => s.split(',').map((k) => k.trim()).filter(Boolean) as InsightKind[])
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const generateInsightSchema = z.object({
  kind: z.nativeEnum(InsightKind).default(InsightKind.NECESSITY),
  period: z.enum(['week', 'month']).default('week'),
  /** true = bỏ qua cache, gọi API thật. Mặc định false để không đốt quota. */
  force: z.boolean().default(false),
});

export const chatSchema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1, 'Vui lòng nhập câu hỏi').max(1000),
});

export type NecessityQuery = z.infer<typeof necessityQuerySchema>;
export type ListInsightQuery = z.infer<typeof listInsightQuerySchema>;
export type GenerateInsightDto = z.infer<typeof generateInsightSchema>;
export type ChatDto = z.infer<typeof chatSchema>;
