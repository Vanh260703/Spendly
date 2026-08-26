import { BankAccount } from '../../bank-accounts/entities/bank-account.entity';
import { User } from '../entities/user.entity';

/** Hình dạng user trả ra API */
export interface UserProfileDto {
  id: string;
  name: string;
  avatarUrl: string | null;
  timezone: string;
  monthStartDay: number;
  onboardedAt: Date | null;
  bankAccount?: {
    id: string;
    accountNumber: string;
    bankName: string;
    nickname: string;
    currentBalance: number;
  };
}

/**
 * Map entity → DTO bằng cách **liệt kê tường minh** từng field.
 *
 * Cố ý không dùng `{ ...user }` hay `delete user.passwordHash`: cách đó là danh sách đen —
 * thêm cột mới vào entity là nó tự động lọt ra API, và không ai nhận ra cho tới khi lộ
 * dữ liệu. Liệt kê tường minh là danh sách trắng: cột mới muốn ra ngoài phải khai ở đây.
 *
 * (`passwordHash` còn có thêm lớp bảo vệ `select: false` ở entity nên vốn đã không được
 * load — nhưng không dựa vào một mình nó, vì `addSelect` ở đâu đó là mất tác dụng.)
 */
export function toUserProfile(user: User, account?: BankAccount): UserProfileDto {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    timezone: user.timezone,
    monthStartDay: user.monthStartDay,
    onboardedAt: user.onboardedAt ?? null,
    ...(account && {
      bankAccount: {
        id: account.id,
        accountNumber: account.accountNumber,
        bankName: account.bankName,
        nickname: account.nickname,
        currentBalance: account.currentBalance,
      },
    }),
  };
}
