import { Wallet } from '../../wallets/entities/wallet.entity';
import { User } from '../entities/user.entity';

/** Hình dạng user trả ra API — khớp với `API_ENDPOINTS.md` §2.1 */
export interface UserProfileDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  timezone: string;
  monthStartDay: number;
  monthlyIncome: number | null;
  onboardedAt: Date | null;
  wallet?: {
    id: string;
    name: string;
    initialBalance: number;
    startedAt: Date | null;
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
export function toUserProfile(user: User, wallet?: Wallet): UserProfileDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    timezone: user.timezone,
    monthStartDay: user.monthStartDay,
    monthlyIncome: user.monthlyIncome ?? null,
    onboardedAt: user.onboardedAt ?? null,
    ...(wallet && {
      wallet: {
        id: wallet.id,
        name: wallet.name,
        initialBalance: wallet.initialBalance,
        startedAt: wallet.startedAt ?? null,
      },
    }),
  };
}
