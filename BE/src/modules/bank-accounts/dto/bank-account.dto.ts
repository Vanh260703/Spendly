import { z } from 'zod';
import { BankAccount } from '../entities/bank-account.entity';

export const linkBankAccountSchema = z.object({
  /** Phải khớp CHÍNH XÁC `accountNumber` SePay gửi, nếu không webhook không tra ra chủ */
  accountNumber: z.string().trim().min(4, 'Số tài khoản quá ngắn').max(30),
  bankName: z.string().trim().min(1, 'Chưa có tên ngân hàng').max(60),
  nickname: z.string().trim().max(60).optional(),
});

export const updateBankAccountSchema = z
  .object({ nickname: z.string().trim().min(1).max(60) })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Không có gì để cập nhật');

export type LinkBankAccountDto = z.infer<typeof linkBankAccountSchema>;
export type UpdateBankAccountDto = z.infer<typeof updateBankAccountSchema>;

export interface BankAccountDto {
  id: string;
  accountNumber: string;
  bankName: string;
  nickname: string;
  currentBalance: number;
  lastSyncedAt: Date | null;
}

/** Whitelist tường minh — xem lý do ở `users/dto/user-profile.dto.ts` */
export function toBankAccountDto(a: BankAccount): BankAccountDto {
  return {
    id: a.id,
    accountNumber: a.accountNumber,
    bankName: a.bankName,
    nickname: a.nickname,
    currentBalance: a.currentBalance,
    lastSyncedAt: a.lastSyncedAt ?? null,
  };
}
