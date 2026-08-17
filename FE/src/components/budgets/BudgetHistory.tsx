'use client';

import { Check, History, X } from 'lucide-react';
import { Card, CardTitle, EmptyState, ErrorState, Skeleton, cn } from '@/components/ui';
import { useBudgetHistory } from '@/hooks/useFinance';
import { formatMoney } from '@/lib/format';

const THANG = (iso: string) => {
  const d = new Date(iso);
  return `Th${d.getMonth() + 1}/${d.getFullYear()}`;
};

/**
 * Lịch sử các kỳ ngân sách ĐÃ ĐÓNG — dữ liệu do job chốt kỳ ghi lại hằng ngày.
 *
 * Đây là chỗ duy nhất thấy được **hạn mức TẠI THỜI ĐIỂM ĐÓ**. Sửa hạn mức 3tr → 5tr thì
 * `budget.amount` mất số cũ, chỉ bảng snapshot còn giữ. Không hiển thị ở đâu thì job chạy
 * mà người dùng không bao giờ biết nó làm gì.
 */
export function BudgetHistory() {
  const { data, isLoading, isError, error, refetch } = useBudgetHistory();

  if (isLoading) return <Skeleton className="h-40" />;

  if (isError) {
    return (
      <Card>
        <CardTitle>Lịch sử các kỳ</CardTitle>
        <ErrorState message={(error as Error)?.message} onRetry={() => void refetch()} />
      </Card>
    );
  }

  if (!data?.length) {
    return (
      <Card>
        <CardTitle>Lịch sử các kỳ</CardTitle>
        <EmptyState
          icon={History}
          title="Chưa có kỳ nào đóng"
          description="Hết kỳ đầu tiên, hệ thống sẽ tự chốt lại kết quả để bạn xem mình có giữ được hạn mức không"
        />
      </Card>
    );
  }

  const soKyDatMuc = data.filter((r) => r.adherence).length;

  return (
    <Card>
      <CardTitle
        action={
          <span className="muted text-xs">
            giữ được hạn mức {soKyDatMuc}/{data.length} kỳ
          </span>
        }
      >
        Lịch sử các kỳ
      </CardTitle>

      <ul className="divide-y">
        {data.map((r) => (
          <li key={`${r.periodStart}-${r.categoryName}`} className="flex items-center gap-3 py-2.5">
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full',
                r.adherence ? 'bg-ok/15 text-ok' : 'bg-exceeded/15 text-exceeded',
              )}
            >
              {r.adherence ? <Check size={15} /> : <X size={15} />}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {r.categoryName ?? 'Toàn bộ chi tiêu'}
              </span>
              <span className="muted text-xs">{THANG(r.periodStart)}</span>
            </span>

            <span className="text-right text-sm">
              <span className="tabular block">
                {formatMoney(r.spent)}
                <span className="muted"> / {formatMoney(r.effectiveAmount)}</span>
              </span>
              {/* rolloverOut có DẤU: âm = kỳ đó tiêu vượt, bị trừ sang kỳ sau */}
              {r.rolloverOut !== 0 && (
                <span
                  className={cn('text-xs', r.rolloverOut > 0 ? 'text-income' : 'text-expense')}
                >
                  chuyển sang kỳ sau {formatMoney(r.rolloverOut, { sign: true })}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <p className="muted mt-3 text-xs">
        Hạn mức hiển thị ở đây là mức <strong>tại thời điểm đó</strong> — sửa hạn mức bây giờ
        không làm thay đổi lịch sử.
      </p>
    </Card>
  );
}
