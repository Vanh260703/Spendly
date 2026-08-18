/** Khớp với `API_ENDPOINTS.md`. Mọi số tiền là `number`, đơn vị đồng (VND), luôn dương. */

export type TxType = 'income' | 'expense';
export type CategoryKind = 'need' | 'want' | 'saving';

export interface Category {
  id: string;
  name: string;
  type: TxType;
  kind: CategoryKind;
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
  category: {
    id: string;
    name: string;
    icon: string;
    color: string;
    kind: CategoryKind;
  } | null;
}

export interface Wallet {
  id: string;
  name: string;
  initialBalance: number;
  startedAt: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  timezone: string;
  monthStartDay: number;
  monthlyIncome: number | null;
  onboardedAt: string | null;
  wallet?: Wallet;
}

export interface BalanceStats {
  currentBalance: number;
  /** Tiền VẪN trong ví nhưng đã gắn nhãn cho mục tiêu */
  committedToGoals: number;
  /** Bạn bè đang nợ bạn — tiền này NGOÀI ví, chưa về, KHÔNG tiêu được */
  owedToMe: number;
  /** Bạn đang nợ bạn bè — vẫn trong ví nhưng đã có chủ */
  owedByMe: number;
  /** Số thực sự tiêu được = currentBalance − committedToGoals − owedByMe */
  freeToSpend: number;
  initialBalance: number;
  totalIncome: number;
  totalExpense: number;
  since: string | null;
}

export interface SummaryStats {
  from: string;
  to: string;
  income: number;
  expense: number;
  net: number;
  byKind: Record<CategoryKind, number>;
  kindRatio: Record<CategoryKind, number>;
  comparison: {
    previousPeriodExpense: number;
    changePercent: number | null;
    avg3PeriodsExpense: number;
  };
}

export interface CategoryStat {
  category: { id: string; name: string; icon: string; color: string; kind: CategoryKind };
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

export interface Budget {
  id: string;
  category: { id: string; name: string; icon: string; color: string } | null;
  period: 'weekly' | 'monthly';
  amount: number;
  rolloverIn: number;
  /** amount + rolloverIn — `progress` tính trên số này, KHÔNG phải `amount` */
  effectiveAmount: number;
  spent: number;
  remaining: number;
  progress: number;
  status: BudgetStatus;
  rollover: boolean;
  rolloverCapRatio: number;
  alertThreshold: number;
  isActive: boolean;
  periodStart: string;
  periodEnd: string;
}

export interface BudgetHistory {
  periodStart: string;
  periodEnd: string;
  period: 'weekly' | 'monthly';
  categoryName: string | null;
  amount: number;
  rolloverIn: number;
  effectiveAmount: number;
  spent: number;
  rolloverOut: number;
  adherence: boolean;
}

export type GoalStatus = 'active' | 'achieved' | 'paused' | 'cancelled';

export interface Goal {
  id: string;
  name: string;
  description: string | null;
  horizon: 'short' | 'long';
  targetAmount: number;
  currentAmount: number;
  remaining: number;
  progress: number;
  deadline: string | null;
  monthlyContribution: number | null;
  /** Cần để dành bao nhiêu/kỳ để kịp deadline — BE tính, TỰ ĐỘI LÊN nếu kỳ nào không nạp */
  requiredMonthly: number | null;
  /** Số kỳ còn lại tới hạn; 0 khi đã quá hạn */
  monthsLeft: number;
  /** true = đã qua hạn mà chưa gom đủ */
  overdue: boolean;
  /** Thực tế đã nạp bao nhiêu trong kỳ này — khác với `monthlyContribution` là số tự khai */
  contributedThisPeriod: number;
  /** KẾ HOẠCH có đủ kịp hạn không. null = chưa đặt deadline */
  onTrack: boolean | null;
  status: GoalStatus;
  icon: string;
  color: string;
}

export interface Debt {
  id: string;
  name: string;
  lender: string | null;
  principal: number;
  remaining: number;
  paid: number;
  progress: number;
  interestRate: number;
  minPayment: number;
  dueDay: number;
  strategy: 'snowball' | 'avalanche';
  isPaid: boolean;
  startDate: string;
}

export interface PayoffPlan {
  strategy: 'snowball' | 'avalanche';
  order: {
    debtId: string;
    name: string;
    interestRate: number;
    remaining: number;
    payoffDate: string;
    totalInterest: number;
    months: number;
  }[];
  /** null = mức trả hằng tháng không đủ tất toán */
  debtFreeDate: string | null;
  totalInterest: number;
  months: number;
}

export interface NecessitySuggestion {
  categoryName: string;
  verdict: 'keep' | 'reduce' | 'cut';
  reason: string;
  action?: string;
  monthlySaving: number;
}

export interface AiInsight {
  id: string;
  kind: string;
  content: string;
  structured: {
    summary?: string;
    suggestions?: NecessitySuggestion[];
    /** Báo cáo kỳ */
    highlights?: { label: string; value: string; note?: string }[];
    warnings?: string[];
    actions?: { title: string; detail: string; impact?: string }[];
    /** Điểm sức khỏe tài chính */
    score?: number;
    breakdown?: Record<string, number>;
    explanation?: string;
  } | null;
  model: string;
  tokensUsed: number;
  /** Kỳ mà báo cáo NÓI VỀ — khác với `generatedAt` là lúc sinh ra nó */
  periodStart?: string;
  periodEnd?: string;
  generatedAt?: string;
  createdAt?: string;
  cached?: boolean;
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
  /** URL ảnh QR chuyển tiền trên Cloudinary — `null` khi chưa lưu QR cho người này */
  qrImage?: string | null;
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
  treatAmount: number;
  /** true = BẠN là người trả */
  iPaid: boolean;
  payer?: { id: string; name: string; color: string } | null;
  category?: { id: string; name: string } | null;
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
