'use client';

import {
  useInfiniteQuery, useMutation, useQuery, useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  bankAccountsApi, budgetsApi, categoriesApi, debtsApi, goalsApi, sepayApi, statsApi,
  transactionsApi, type TxFilters,
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
    for (const key of ['balance', 'summary', 'by-category', 'trend', 'calendar', 'transactions', 'bank-accounts', 'contacts', 'budgets', 'goals', 'debts']) {
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
 * Nhận **hoặc** `period` (today/week/month — dùng cho bộ chọn kỳ kiểu nút bấm ở `/dashboard`)
 * **hoặc** `from`/`to` (khoảng ngày tùy chọn — dùng cho `DateRangeFilter` ở `/transactions`).
 * Có `from`/`to` thì ưu tiên chúng; không có gì cả thì BE tự tính kỳ tháng hiện tại.
 */
export const useSummary = (params: { period?: string; from?: string; to?: string } = {}) => {
  const query = khoangHoacKy(params);
  return useQuery({ queryKey: ['summary', query], queryFn: () => statsApi.summary(query) });
};

/**
 * Chuẩn hoá tham số trước khi gửi lên BE — dùng chung cho `useSummary`/`useByCategory`/`useTrend`.
 *
 * ⚠️ `rangeQuerySchema` ở BE bắt `from` và `to` phải đi CÙNG NHAU — gửi lẻ một cái là 400.
 * Mà màn hình lọc có hai ô ngày riêng, user điền một ô là chuyện bình thường. Không chặn ở
 * đây thì request hỏng, hook trả `undefined`, và các thẻ số hiện "0₫" như thể bạn không tiêu
 * đồng nào — sai mà trông vẫn hợp lý, đúng kiểu lỗi khó phát hiện nhất.
 *
 * Thiếu `from`/`to` thì dùng `period` nếu có; thiếu cả hai thì để BE tự tính kỳ tháng hiện tại.
 */
function khoangHoacKy(params: {
  period?: string;
  from?: string;
  to?: string;
}): { period?: string; from?: string; to?: string } {
  if (params.from && params.to) return { from: params.from, to: params.to };
  return params.period ? { period: params.period } : {};
}

/**
 * Chọn độ mịn của biểu đồ theo độ dài khoảng.
 *
 * Vẽ theo NGÀY cho khoảng một năm là 365 cột dính vào nhau, không đọc được gì. Ngưỡng đặt
 * theo số cột mà màn hình điện thoại còn phân biệt được, không theo mốc lịch.
 */
function chonDoMin(from?: string, to?: string): 'day' | 'week' | 'month' {
  if (!from || !to) return 'day'; // kỳ mặc định của BE là tháng hiện tại
  const soNgay = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
  if (soNgay <= 62) return 'day';
  // 180 chứ không phải 370: gom tuần cho khoảng một năm ra 53 cột, dày ngang gom theo ngày.
  // Quá nửa năm thì gom tháng — 12 cột cho một năm mới là thứ nhìn ra được xu hướng.
  if (soNgay <= 180) return 'week';
  return 'month';
}

export const useByCategory = (
  params: { period?: string; from?: string; to?: string; type?: string } = {},
) => {
  const query = khoangHoacKy(params);
  const type = params.type ?? 'expense';
  return useQuery({
    queryKey: ['by-category', query, type],
    queryFn: () => statsApi.byCategory({ ...query, type }),
  });
};

export const useTrend = (params: { period?: string; from?: string; to?: string } = {}) => {
  const query = khoangHoacKy(params);
  // `chonDoMin` chỉ có ý nghĩa khi có khoảng from/to tùy chọn — chọn theo `period` (today/
  // week/month) thì luôn đủ ngắn để vẽ theo NGÀY, khớp hành vi mặc định của nó khi thiếu cả hai.
  const groupBy = chonDoMin(params.from, params.to);
  return useQuery({
    queryKey: ['trend', query, groupBy],
    queryFn: () => statsApi.trend({ ...query, groupBy }),
  });
};

export const useAnomalies = (params: { from?: string; to?: string } = {}) => {
  const khoang = khoangHoacKy(params);
  return useQuery({
    queryKey: ['anomalies', khoang],
    queryFn: () => statsApi.anomalies(khoang),
  });
};

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

/** Nạp tiền vào mục tiêu — làm sai `committedToGoals`/`freeToSpend` ở màn hình số dư */
export function useContribute() {
  const lamMoi = useLamMoiTaiChinh();
  return useMutation({
    mutationFn: ({ id, amount, note }: { id: string; amount: number; note?: string }) =>
      goalsApi.contribute(id, { amount, note }),
    onSuccess: (goal) => {
      lamMoi();
      toast.success(
        goal.status === 'achieved'
          ? `Chúc mừng! Đã đạt mục tiêu "${goal.name}"`
          : 'Đã nạp vào mục tiêu',
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

export const useDebts = () => useQuery({ queryKey: ['debts'], queryFn: () => debtsApi.list() });

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
