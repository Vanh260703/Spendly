import { api } from './client';
import type {
  AiInsight, BalanceStats, Budget, BudgetHistory, CalendarStats, CategoryStat,
  Category, Contact, ContactDetail, Debt, Goal, Paginated, PayoffPlan,
  SharedExpense, SummaryStats, Transaction, TrendPoint, UserProfile, Wallet,
} from '@/types';

const qs = (params: Record<string, unknown>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const authApi = {
  register: (body: { email: string; password: string; name: string }) =>
    api.post<{ user: UserProfile; accessToken: string }>('/auth/register', body),
  login: (body: { email: string; password: string }) =>
    api.post<{ user: UserProfile; accessToken: string }>('/auth/login', body),
  logout: () => api.post<void>('/auth/logout'),
  me: () => api.get<UserProfile>('/auth/me'),
};

export const usersApi = {
  me: () => api.get<UserProfile>('/users/me'),
  update: (body: Partial<UserProfile>) => api.patch<UserProfile>('/users/me', body),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api.patch<void>('/users/me/password', body),
  onboarding: (body: { initialBalance: number; monthlyIncome?: number }) =>
    api.post<UserProfile>('/users/me/onboarding', body),
};

export const walletApi = {
  get: () => api.get<Wallet>('/wallet'),
  update: (body: Partial<Wallet>) => api.patch<Wallet>('/wallet', body),
};

export const categoriesApi = {
  list: (params: { type?: string; kind?: string } = {}) =>
    api.get<Category[]>(`/categories${qs(params)}`),
  create: (body: Partial<Category>) => api.post<Category>('/categories', body),
  update: (id: string, body: Partial<Category>) => api.patch<Category>(`/categories/${id}`, body),
  remove: (id: string) => api.delete<{ movedTransactions: number }>(`/categories/${id}`),
};

export interface TxFilters {
  from?: string; to?: string; categoryId?: string; type?: string;
  minAmount?: number; maxAmount?: number; q?: string; tags?: string;
  cursor?: string; limit?: number;
}

export const transactionsApi = {
  list: (params: TxFilters = {}) =>
    api.get<Paginated<Transaction>>(`/transactions${qs(params as Record<string, unknown>)}`),
  create: (body: {
    type: string; amount: number; categoryId: string; date: string;
    note?: string | null; tags?: string[];
  }) => api.post<Transaction>('/transactions', body),
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<Transaction>(`/transactions/${id}`, body),
  remove: (id: string) => api.delete<void>(`/transactions/${id}`),
  adjustBalance: (body: { actualBalance: number; note?: string }) =>
    api.post<{
      calculatedBalance: number; actualBalance: number;
      difference: number; transaction: Transaction | null;
    }>('/transactions/adjust-balance', body),
};

export const statsApi = {
  balance: () => api.get<BalanceStats>('/stats/balance'),
  summary: (params: { period?: string; from?: string; to?: string } = {}) =>
    api.get<SummaryStats>(`/stats/summary${qs(params)}`),
  byCategory: (params: { period?: string; type?: string } = {}) =>
    api.get<CategoryStat[]>(`/stats/by-category${qs(params)}`),
  trend: (params: { period?: string; from?: string; to?: string; groupBy?: string } = {}) =>
    api.get<TrendPoint[]>(`/stats/trend${qs(params)}`),
  calendar: (params: { month?: string } = {}) =>
    api.get<CalendarStats>(`/stats/calendar${qs(params)}`),
};

export const budgetsApi = {
  list: () => api.get<Budget[]>('/budgets'),
  history: (params: { limit?: number } = {}) =>
    api.get<BudgetHistory[]>(`/budgets/history${qs(params)}`),
  create: (body: Record<string, unknown>) => api.post<Budget>('/budgets', body),
  update: (id: string, body: Record<string, unknown>) => api.patch<Budget>(`/budgets/${id}`, body),
  remove: (id: string) => api.delete<void>(`/budgets/${id}`),
};

export const goalsApi = {
  list: (params: { horizon?: string; status?: string } = {}) =>
    api.get<Goal[]>(`/goals${qs(params)}`),
  create: (body: Record<string, unknown>) => api.post<Goal>('/goals', body),
  update: (id: string, body: Record<string, unknown>) => api.patch<Goal>(`/goals/${id}`, body),
  remove: (id: string) => api.delete<void>(`/goals/${id}`),
  contribute: (id: string, body: { amount: number; note?: string }) =>
    api.post<Goal>(`/goals/${id}/contribute`, body),
};

export const debtsApi = {
  list: () => api.get<Debt[]>('/debts'),
  create: (body: Record<string, unknown>) => api.post<Debt>('/debts', body),
  update: (id: string, body: Record<string, unknown>) => api.patch<Debt>(`/debts/${id}`, body),
  pay: (id: string, body: { amount: number }) => api.post<Debt>(`/debts/${id}/payment`, body),
  payoffPlan: (params: { strategy?: string; extraPayment?: number } = {}) =>
    api.get<PayoffPlan>(`/debts/payoff-plan${qs(params)}`),
};

export const aiApi = {
  necessityReview: (params: { period?: string } = {}) =>
    api.get<AiInsight & { cached: boolean }>(`/ai/necessity-review${qs(params)}`),
  /** Báo cáo tổng kết kỳ: tóm tắt · điểm nổi bật · cảnh báo · 3 việc nên làm */
  report: (params: { period?: string } = {}) =>
    api.get<AiInsight & { cached: boolean }>(`/ai/report${qs(params)}`),
  healthScore: () => api.get<AiInsight & { cached: boolean }>('/ai/health-score'),
  insights: (params: { kind?: string; kinds?: string; limit?: number } = {}) =>
    api.get<AiInsight[]>(`/ai/insights${qs(params)}`),
  chat: (body: { message: string; conversationId?: string | null }) =>
    api.post<{ conversationId: string; reply: string }>('/ai/chat', body),
};

export const contactsApi = {
  list: (params: { q?: string; includeArchived?: boolean } = {}) =>
    api.get<Contact[]>(`/contacts${qs(params)}`),
  detail: (id: string) => api.get<ContactDetail>(`/contacts/${id}`),
  /** Tên đã có → BE trả về chính người đó, không báo trùng. Form chia bill dựa vào đây. */
  create: (body: { name: string; phone?: string | null; note?: string | null }) =>
    api.post<Contact>('/contacts', body),
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<Contact>(`/contacts/${id}`, body),
  remove: (id: string) => api.delete<void>(`/contacts/${id}`),
};

export const sharedExpensesApi = {
  list: (params: { contactId?: string; limit?: number } = {}) =>
    api.get<SharedExpense[]>(`/shared-expenses${qs(params)}`),
  create: (body: Record<string, unknown>) =>
    api.post<SharedExpense>('/shared-expenses', body),
  remove: (id: string) => api.delete<void>(`/shared-expenses/${id}`),
};

export const settlementsApi = {
  create: (body: Record<string, unknown>) => api.post<unknown>('/settlements', body),
  remove: (id: string) => api.delete<void>(`/settlements/${id}`),
};

export const exportUrl = (params: { from?: string; to?: string } = {}) =>
  `/export/excel${qs(params)}`;
