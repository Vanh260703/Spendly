'use client';

import {
  useInfiniteQuery, useMutation, useQuery, useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  budgetsApi, categoriesApi, debtsApi, goalsApi, statsApi,
  transactionsApi, walletApi, type TxFilters,
} from '@/lib/api';
import type { ApiError } from '@/lib/api/client';

const loi = (e: unknown) => (e as ApiError).message ?? 'Đã có lỗi xảy ra';

/**
 * Mọi thay đổi tiền đều làm sai số liệu ở nhiều màn hình cùng lúc (số dư, thống kê,
 * ngân sách, mục tiêu). Gom về một chỗ để không sót — sót một key là user thấy số cũ
 * mà không hiểu vì sao.
 */
function useLamMoiTaiChinh() {
  const qc = useQueryClient();
  return () => {
    for (const key of ['balance', 'summary', 'by-category', 'trend', 'calendar', 'transactions', 'budgets', 'goals']) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

// ————————————————————————— Danh mục —————————————————————————

export const useCategories = (params: { type?: string } = {}) =>
  useQuery({
    queryKey: ['categories', params],
    queryFn: () => categoriesApi.list(params),
    // Danh mục gần như không đổi — cache lâu để form nhập nhanh mở tức thì
    staleTime: 5 * 60_000,
  });

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: categoriesApi.create,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Đã thêm danh mục');
    },
    onError: (e) => toast.error(loi(e)),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  const lamMoi = useLamMoiTaiChinh();
  return useMutation({
    mutationFn: categoriesApi.remove,
    onSuccess: (kq) => {
      void qc.invalidateQueries({ queryKey: ['categories'] });
      lamMoi();
      toast.success(
        kq.movedTransactions > 0
          ? `Đã xóa. ${kq.movedTransactions} giao dịch được chuyển sang "Khác"`
          : 'Đã xóa danh mục',
      );
    },
    onError: (e) => toast.error(loi(e)),
  });
}

// ————————————————————————— Thống kê —————————————————————————

export const useBalance = () =>
  useQuery({ queryKey: ['balance'], queryFn: statsApi.balance });

export const useSummary = (period = 'month') =>
  useQuery({ queryKey: ['summary', period], queryFn: () => statsApi.summary({ period }) });

export const useByCategory = (period = 'month', type = 'expense') =>
  useQuery({
    queryKey: ['by-category', period, type],
    queryFn: () => statsApi.byCategory({ period, type }),
  });

export const useTrend = (period = 'month', groupBy = 'day') =>
  useQuery({
    queryKey: ['trend', period, groupBy],
    queryFn: () => statsApi.trend({ period, groupBy }),
  });

export const useCalendar = (month?: string) =>
  useQuery({ queryKey: ['calendar', month], queryFn: () => statsApi.calendar({ month }) });

// ————————————————————————— Giao dịch —————————————————————————

/** Cuộn vô hạn bằng cursor — offset sẽ nhảy/lặp bản ghi khi vừa thêm giao dịch mới */
export const useTransactions = (filters: TxFilters = {}) =>
  useInfiniteQuery({
    queryKey: ['transactions', filters],
    queryFn: ({ pageParam }) =>
      transactionsApi.list({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export function useCreateTransaction() {
  const lamMoi = useLamMoiTaiChinh();
  return useMutation({
    mutationFn: transactionsApi.create,
    onSuccess: () => {
      lamMoi();
      toast.success('Đã ghi giao dịch');
    },
    onError: (e) => toast.error(loi(e)),
  });
}

export function useDeleteTransaction() {
  const lamMoi = useLamMoiTaiChinh();
  return useMutation({
    mutationFn: transactionsApi.remove,
    onSuccess: () => {
      lamMoi();
      toast.success('Đã xóa giao dịch');
    },
    onError: (e) => toast.error(loi(e)),
  });
}

export function useAdjustBalance() {
  const lamMoi = useLamMoiTaiChinh();
  return useMutation({
    mutationFn: transactionsApi.adjustBalance,
    onSuccess: (kq) => {
      lamMoi();
      toast.success(
        kq.difference === 0
          ? 'Số dư đã khớp, không cần điều chỉnh'
          : 'Đã tạo giao dịch bù chênh lệch',
      );
    },
    onError: (e) => toast.error(loi(e)),
  });
}

// ————————————————————————— Ví —————————————————————————

export const useWallet = () => useQuery({ queryKey: ['wallet'], queryFn: walletApi.get });

// ————————————————————————— Ngân sách —————————————————————————

export const useBudgets = () =>
  useQuery({ queryKey: ['budgets'], queryFn: budgetsApi.list });

export const useBudgetHistory = () =>
  useQuery({ queryKey: ['budget-history'], queryFn: () => budgetsApi.history({ limit: 24 }) });

export function useCreateBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: budgetsApi.create,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Đã đặt ngân sách');
    },
    onError: (e) => toast.error(loi(e)),
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: budgetsApi.remove,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Đã xóa ngân sách');
    },
    onError: (e) => toast.error(loi(e)),
  });
}

// ————————————————————————— Mục tiêu —————————————————————————

export const useGoals = () => useQuery({ queryKey: ['goals'], queryFn: () => goalsApi.list() });

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: goalsApi.create,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['goals'] });
      toast.success('Đã tạo mục tiêu');
    },
    onError: (e) => toast.error(loi(e)),
  });
}

export function useContribute() {
  const lamMoi = useLamMoiTaiChinh();
  return useMutation({
    mutationFn: ({ id, amount, note }: { id: string; amount: number; note?: string }) =>
      goalsApi.contribute(id, { amount, note }),
    onSuccess: (goal) => {
      lamMoi();
      toast.success(
        goal.status === 'achieved' ? `Chúc mừng! Đã đạt mục tiêu "${goal.name}"` : 'Đã nạp vào mục tiêu',
      );
    },
    onError: (e) => toast.error(loi(e)),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  const lamMoi = useLamMoiTaiChinh();
  return useMutation({
    mutationFn: goalsApi.remove,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['goals'] });
      lamMoi();
      toast.success('Đã xóa mục tiêu');
    },
    onError: (e) => toast.error(loi(e)),
  });
}

// ————————————————————————— Khoản nợ —————————————————————————

export const useDebts = () => useQuery({ queryKey: ['debts'], queryFn: debtsApi.list });

export const usePayoffPlan = (strategy: string, extraPayment: number) =>
  useQuery({
    queryKey: ['payoff-plan', strategy, extraPayment],
    queryFn: () => debtsApi.payoffPlan({ strategy, extraPayment }),
  });

export function useCreateDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: debtsApi.create,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['debts'] });
      void qc.invalidateQueries({ queryKey: ['payoff-plan'] });
      toast.success('Đã thêm khoản nợ');
    },
    onError: (e) => toast.error(loi(e)),
  });
}

export function usePayDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => debtsApi.pay(id, { amount }),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['debts'] });
      void qc.invalidateQueries({ queryKey: ['payoff-plan'] });
      toast.success(d.isPaid ? `Đã trả xong "${d.name}"` : 'Đã ghi khoản trả nợ');
    },
    onError: (e) => toast.error(loi(e)),
  });
}
