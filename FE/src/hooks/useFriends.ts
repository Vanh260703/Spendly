'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { contactsApi, settlementsApi, sharedExpensesApi } from '@/lib/api';
import type { ApiError } from '@/lib/api/client';

const loi = (e: unknown) => (e as ApiError).message ?? 'Đã có lỗi xảy ra';

/**
 * Chia bill và tất toán đều SINH GIAO DỊCH, nên làm sai số liệu ở khắp nơi cùng lúc:
 * số dư, thống kê theo danh mục, ngân sách, và tất nhiên là công nợ.
 *
 * Gom về một chỗ để không sót — sót một key là user thấy số cũ mà không hiểu vì sao.
 */
function useLamMoiCongNo() {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      'contacts', 'shared-expenses',
      'balance', 'summary', 'by-category', 'trend', 'calendar', 'transactions', 'budgets',
    ]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

// ————————————————————————— Danh bạ —————————————————————————

export const useContacts = (params: { q?: string; includeArchived?: boolean } = {}) =>
  useQuery({
    queryKey: ['contacts', params],
    queryFn: () => contactsApi.list(params),
  });

export const useContactDetail = (id: string | null) =>
  useQuery({
    queryKey: ['contacts', 'detail', id],
    queryFn: () => contactsApi.detail(id!),
    enabled: !!id,
  });

/**
 * Thêm người vào danh bạ.
 *
 * ⚠️ **KHÔNG toast ở đây.** Hàm này còn được ô chọn người trong form chia bill dùng để
 * "gõ tên mới là tạo tại chỗ" — bắn toast mỗi lần gõ một cái tên sẽ rất phiền. Trang Danh
 * bạ tự toast ở `onSuccess` của chính nó.
 */
export function useCreateContact() {
  const lamMoi = useLamMoiCongNo();
  return useMutation({
    mutationFn: contactsApi.create,
    onSuccess: lamMoi,
    onError: (e) => toast.error(loi(e)),
  });
}

export function useUpdateContact() {
  const lamMoi = useLamMoiCongNo();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      contactsApi.update(id, body),
    onSuccess: () => {
      lamMoi();
      toast.success('Đã cập nhật');
    },
    onError: (e) => toast.error(loi(e)),
  });
}

export function useDeleteContact() {
  const lamMoi = useLamMoiCongNo();
  return useMutation({
    mutationFn: contactsApi.remove,
    onSuccess: () => {
      lamMoi();
      toast.success('Đã xóa khỏi danh bạ');
    },
    // Xóa người còn nợ trả 409 kèm số tiền cụ thể — hiện nguyên văn cho user biết vì sao
    onError: (e) => toast.error(loi(e)),
  });
}

// ————————————————————————— Chia bill —————————————————————————

export const useSharedExpenses = (params: { contactId?: string; limit?: number } = {}) =>
  useQuery({
    queryKey: ['shared-expenses', params],
    queryFn: () => sharedExpensesApi.list(params),
  });

export function useCreateSharedExpense() {
  const lamMoi = useLamMoiCongNo();
  return useMutation({
    mutationFn: sharedExpensesApi.create,
    onSuccess: () => {
      lamMoi();
      toast.success('Đã ghi khoản chi chung');
    },
    onError: (e) => toast.error(loi(e)),
  });
}

export function useDeleteSharedExpense() {
  const lamMoi = useLamMoiCongNo();
  return useMutation({
    mutationFn: sharedExpensesApi.remove,
    onSuccess: () => {
      lamMoi();
      toast.success('Đã xóa, số dư và công nợ đã hoàn lại');
    },
    onError: (e) => toast.error(loi(e)),
  });
}

// ————————————————————————— Tất toán —————————————————————————

export function useCreateSettlement() {
  const lamMoi = useLamMoiCongNo();
  return useMutation({
    mutationFn: settlementsApi.create,
    onSuccess: () => {
      lamMoi();
      toast.success('Đã ghi tất toán');
    },
    onError: (e) => toast.error(loi(e)),
  });
}
