'use client';

import {
  useInfiniteQuery, useMutation, useQuery, useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  bankAccountsApi, categoriesApi, sepayApi, statsApi, transactionsApi, type TxFilters,
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
    for (const key of ['balance', 'summary', 'by-category', 'trend', 'calendar', 'transactions', 'bank-accounts', 'contacts']) {
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

/**
 * Tổng thu/chi của một khoảng.
 *
 * Nhận `from`/`to` để bám theo đúng bộ lọc ngày trên màn hình — đặt khoảng là tháng thì ra
 * số của tháng đó. Bỏ trống cả hai thì BE tính kỳ tháng hiện tại.
 */
export const useSummary = (params: { from?: string; to?: string } = {}) =>
  useQuery({ queryKey: ['summary', params], queryFn: () => statsApi.summary(params) });

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


// ————————————————————————— Tài khoản ngân hàng —————————————————————————

export const useBankAccounts = () =>
  useQuery({ queryKey: ['bank-accounts'], queryFn: bankAccountsApi.list });

export function useLinkBankAccount() {
  const lamMoi = useLamMoiTaiChinh();
  return useMutation({
    mutationFn: bankAccountsApi.link,
    onSuccess: () => {
      lamMoi();
      toast.success('Đã liên kết tài khoản');
    },
    onError: (e) => toast.error(loi(e)),
  });
}

export function useUnlinkBankAccount() {
  const lamMoi = useLamMoiTaiChinh();
  return useMutation({
    mutationFn: bankAccountsApi.unlink,
    onSuccess: () => {
      lamMoi();
      toast.success('Đã gỡ liên kết');
    },
    onError: (e) => toast.error(loi(e)),
  });
}

/**
 * Gán danh mục cho một giao dịch.
 *
 * Giao dịch từ ngân hàng về đều rơi vào "Chưa phân loại" — đây là thao tác biến chúng
 * thành dữ liệu dùng được.
 */
export function useUpdateTransaction() {
  const lamMoi = useLamMoiTaiChinh();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      transactionsApi.update(id, body),
    onSuccess: lamMoi,
    onError: (e) => toast.error(loi(e)),
  });
}




// ————————————————————————— Đồng bộ SePay —————————————————————————

export const useSepayStatus = () =>
  useQuery({ queryKey: ['sepay', 'status'], queryFn: sepayApi.status, staleTime: 60_000 });

/**
 * Kéo giao dịch từ SePay về.
 *
 * Bấm bao nhiêu lần cũng không sao — BE chống trùng bằng `(userId, sepayId)`, nên chạy thừa
 * chỉ tốn một lượt gọi chứ không đẻ ra dữ liệu sai.
 */
export function useSyncSepay() {
  const lamMoi = useLamMoiTaiChinh();
  return useMutation({
    mutationFn: sepayApi.sync,
    onSuccess: (kq) => {
      lamMoi();
      toast.success(
        kq.moi > 0
          ? `Đã thêm ${kq.moi} giao dịch mới`
          : 'Đã đồng bộ — không có giao dịch nào mới',
      );
    },
    onError: (e) => toast.error(loi(e)),
  });
}

/** Bao nhiêu khoản chưa xét — dùng cho huy hiệu trên ô lọc */
export const useSoChuaXet = () =>
  useQuery({ queryKey: ['transactions', 'unreviewed-count'], queryFn: transactionsApi.demChuaXet });

/**
 * Đánh dấu một khoản đã xét (hoặc bỏ đánh dấu).
 *
 * Không toast: đây là thao tác lướt nhanh qua hàng chục dòng, mỗi dòng một thông báo là
 * màn hình đầy toast.
 */
export function useDanhDauDaXet() {
  const lamMoi = useLamMoiTaiChinh();
  return useMutation({
    mutationFn: ({ id, reviewed }: { id: string; reviewed: boolean }) =>
      transactionsApi.update(id, { reviewed }),
    onSuccess: lamMoi,
    onError: (e) => toast.error(loi(e)),
  });
}
