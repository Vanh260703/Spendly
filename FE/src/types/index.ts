/** Khớp với response của BE. Mọi số tiền là `number`, đơn vị đồng (VND), luôn dương. */

export type TxType = 'income' | 'expense';
export type CategoryKind = 'need' | 'want' | 'saving';

export interface Category {
  id: string;
  name: string;
  type: TxType;
  icon: string;
  color: string;
  parentId: string | null;
  isDefault: boolean;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  date: string;
  note: string | null;
  tags: string[];
  /** `null` = chưa xét xem có phần trả hộ người khác không */
  reviewedAt: string | null;
  category: {
    id: string;
    name: string;
    icon: string;
    color: string;
  } | null;
}


export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  timezone: string;
  monthStartDay: number;
  onboardedAt: string | null;
  bankAccount?: {
    id: string;
    accountNumber: string;
    bankName: string;
    nickname: string;
    currentBalance: number;
  };
}

export interface BalanceStats {
  /** Số dư NGÂN HÀNG báo về — không phải app tự cộng trừ */
  currentBalance: number;
  /** Bạn bè đang nợ bạn — tiền này NGOÀI tài khoản, chưa về, KHÔNG tiêu được */
  owedToMe: number;
  /** Bạn đang nợ bạn bè — vẫn trong tài khoản nhưng đã có chủ */
  owedByMe: number;
  /** Số thực sự tiêu được = currentBalance − owedByMe */
  freeToSpend: number;
  /** Lần cuối nhận webhook — im lặng lâu là dấu hiệu liên kết SePay hỏng */
  lastSyncedAt: string | null;
  totalIncome: number;
  totalExpense: number;
}

export interface SummaryStats {
  from: string;
  to: string;
  income: number;
  /** Tổng ngân hàng cộng vào, trước khi bỏ phần bạn bè trả lại */
  incomeGross: number;
  /** Bạn bè trả lại trong kỳ — tiền của bạn quay về, không phải thu nhập */
  repaidInPeriod: number;
  expense: number;
  /** Tổng ngân hàng trừ, trước khi bỏ phần cho mượn */
  expenseGross: number;
  /** Phần bạn đã ứng cho người khác trong kỳ */
  lentInPeriod: number;
  net: number;
  comparison: {
    previousPeriodExpense: number;
    /** `null` = kỳ trước không có dữ liệu, hiện "so sánh" lúc đó là bịa */
    changePercent: number | null;
    avg3PeriodsExpense: number;
  };
}

export interface CategoryStat {
  category: { id: string; name: string; icon: string; color: string };
  total: number;
  /** Số LẦN giao dịch — phân biệt "1 lần 500k" với "10 lần 50k" */
  count: number;
  average: number;
  percentOfExpense: number;
  percentOfIncome: number;
  /** null = chưa đủ dữ liệu để so sánh */
  vsPrevious3Avg: number | null;
}

export interface TrendPoint {
  bucket: string;
  income: number;
  expense: number;
}

export interface CalendarStats {
  days: { date: string; expense: number; count: number }[];
  max: number;
}

export type BudgetStatus = 'ok' | 'warning' | 'exceeded';



export type GoalStatus = 'active' | 'achieved' | 'paused' | 'cancelled';




export interface NecessitySuggestion {
  categoryName: string;
  verdict: 'keep' | 'reduce' | 'cut';
  reason: string;
  action?: string;
  monthlySaving: number;
}


export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

// ————————————————————— Danh bạ & công nợ —————————————————————

export interface Contact {
  id: string;
  name: string;
  phone?: string | null;
  note?: string | null;
  color: string;
  isArchived: boolean;
  /** Dương = họ nợ bạn · Âm = bạn nợ họ */
  balance: number;
  lastActivityAt?: string | null;
}

export interface SharedExpenseShare {
  contactId: string | null;
  name: string;
  amount: number;
}

export interface SharedExpense {
  id: string;
  date: string;
  note?: string | null;
  totalAmount: number;
  /** true = BẠN là người trả */
  iPaid: boolean;
  /** Giao dịch ngân hàng tương ứng — `null` khi trả tiền mặt */
  transactionId: string | null;
  payer?: { id: string; name: string; color: string } | null;
  shares: SharedExpenseShare[];
}

export type SettlementDirection = 'they_paid_me' | 'i_paid_them';

/** Một dòng trong lịch sử của một người — chia bill hoặc tất toán */
export interface ContactHistoryItem {
  kind: 'shared_expense' | 'settlement';
  id: string;
  date: string;
  note?: string | null;
  categoryName?: string | null;
  totalAmount?: number;
  iPaid?: boolean;
  myShare?: number;
  theirShare?: number;
  direction?: SettlementDirection;
  amount?: number;
  /** Tác động lên công nợ: dương = họ nợ thêm */
  effect: number;
}

export interface ContactDetail {
  contact: Contact;
  history: ContactHistoryItem[];
}

// ————————————————————— Ngân hàng —————————————————————

export interface BankAccount {
  id: string;
  accountNumber: string;
  bankName: string;
  nickname: string;
  /** Số dư ngân hàng báo về — app không tự tính */
  currentBalance: number;
  lastSyncedAt: string | null;
}
