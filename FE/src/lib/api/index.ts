import { api } from './client';
import type {
  BalanceStats, BankAccount, CalendarStats, CategoryStat, Category, Contact,
  ContactDetail, Paginated, SharedExpense, SummaryStats, Transaction, TrendPoint,
  UserProfile,
} from '@/types';

const qs = (params: Record<string, unknown>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : '';
};


export const usersApi = {
  me: () => api.get<UserProfile>('/users/me'),
  update: (body: Partial<UserProfile>) => api.patch<UserProfile>('/users/me', body),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api.patch<void>('/users/me/password', body),
  onboarding: (body: { accountNumber: string; bankName: string; nickname?: string }) =>
    api.post<UserProfile>('/users/me/onboarding', body),
};

export const bankAccountsApi = {
  list: () => api.get<BankAccount[]>('/bank-accounts'),
  link: (body: { accountNumber: string; bankName: string; nickname?: string }) =>
    api.post<BankAccount>('/bank-accounts', body),
  update: (id: string, body: { nickname: string }) =>
    api.patch<BankAccount>(`/bank-accounts/${id}`, body),
  unlink: (id: string) => api.delete<void>(`/bank-accounts/${id}`),
};

export const categoriesApi = {
  create: (body: Record<string, unknown>) => api.post<Category>('/categories', body),
  list: (params: { type?: string; kind?: string } = {}) =>
    api.get<Category[]>(`/categories${qs(params)}`),
  update: (id: string, body: Partial<Category>) => api.patch<Category>(`/categories/${id}`, body),
  remove: (id: string) => api.delete<{ movedTransactions: number }>(`/categories/${id}`),
};

export interface TxFilters {
  from?: string; to?: string; categoryId?: string; type?: string;
  minAmount?: number; maxAmount?: number; q?: string; tags?: string;
  cursor?: string; limit?: number;
  /** Chỉ hiện khoản CHƯA xét có phần trả hộ hay không */
  unreviewed?: boolean;
}

export const transactionsApi = {
  list: (params: TxFilters = {}) =>
    api.get<Paginated<Transaction>>(`/transactions${qs(params as Record<string, unknown>)}`),
  /**
   * ⚠️ KHÔNG có `create`. Giao dịch chỉ đến từ webhook SePay hoặc từ việc tách một giao
   * dịch ngân hàng khi chia bill. Nhập tay là làm số dư app lệch khỏi số dư ngân hàng.
   */
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<Transaction>(`/transactions/${id}`, body),
  remove: (id: string) => api.delete<void>(`/transactions/${id}`),
  demChuaXet: () => api.get<{ count: number }>('/transactions/unreviewed-count'),
};

export const sepayApi = {
  status: () => api.get<{ configured: boolean }>('/sepay/status'),
  /** `tuNgay` chỉ dùng khi nạp lịch sử cũ; bỏ trống thì đồng bộ tăng dần */
  sync: (body: { tuNgay?: string } = {}) =>
    api.post<{ moi: number; daCo: number; soDu: number; thoiDiem: string }>(
      '/sepay/sync',
      body,
    ),
};

export const statsApi = {
  balance: () => api.get<BalanceStats>('/stats/balance'),
  summary: (params: { period?: string; from?: string; to?: string } = {}) =>
    api.get<SummaryStats>(`/stats/summary${qs(params)}`),
  byCategory: (params: { period?: string; type?: string } = {}) =>
    api.get<CategoryStat[]>(`/stats/by-category${qs(params)}`),
  trend: (params: { period?: string; groupBy?: string } = {}) =>
    api.get<TrendPoint[]>(`/stats/trend${qs(params)}`),
  calendar: (params: { month?: string } = {}) =>
    api.get<CalendarStats>(`/stats/calendar${qs(params)}`),
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
