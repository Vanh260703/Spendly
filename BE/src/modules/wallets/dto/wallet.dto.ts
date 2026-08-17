import { z } from 'zod';
import { Wallet } from '../entities/wallet.entity';

export const updateWalletSchema = z
  .object({
    name: z.string().trim().min(1, 'Tên ví không được để trống').max(100),
    initialBalance: z.number().int().nonnegative('Số dư ban đầu không được âm'),
    startedAt: z.coerce.date(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Không có gì để cập nhật');

export type UpdateWalletDto = z.infer<typeof updateWalletSchema>;

export interface WalletDto {
  id: string;
  name: string;
  initialBalance: number;
  startedAt: Date | null;
}

/** Whitelist tường minh — xem lý do ở `users/dto/user-profile.dto.ts` */
export function toWalletDto(w: Wallet): WalletDto {
  return {
    id: w.id,
    name: w.name,
    initialBalance: w.initialBalance,
    startedAt: w.startedAt ?? null,
  };
}
