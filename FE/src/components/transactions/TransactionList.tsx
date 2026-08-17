'use client';

import { Receipt, Trash2 } from 'lucide-react';
import { Button, Card, CategoryIcon, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { useDeleteTransaction, useTransactions } from '@/hooks/useFinance';
import type { TxFilters } from '@/lib/api';
import { formatDayLabel, formatMoney } from '@/lib/format';
import type { Transaction } from '@/types';

export function TransactionList({
  filters = {},
  compact = false,
}: {
  filters?: TxFilters;
  compact?: boolean;
}) {
  const { data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTransactions(filters);
  const xoa = useDeleteTransaction();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  // Phải kiểm tra LỖI trước khi kiểm tra rỗng — nếu không, request hỏng sẽ hiển thị
  // "chưa có giao dịch nào" và user tưởng mất dữ liệu
  if (isError) {
    return (
      <Card>
        <ErrorState message={(error as Error)?.message} onRetry={() => void refetch()} />
      </Card>
    );
  }

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (!items.length) {
    return (
      <Card>
        <EmptyState
          icon={Receipt}
          title="Chưa có giao dịch nào"
          description="Ghi khoản đầu tiên để bắt đầu theo dõi chi tiêu"
        />
      </Card>
    );
  }

  // Gom theo ngày — danh sách phẳng hàng trăm dòng rất khó đọc
  const theoNgay = new Map<string, Transaction[]>();
  for (const t of items) {
    const key = t.date.slice(0, 10);
    theoNgay.set(key, [...(theoNgay.get(key) ?? []), t]);
  }

  return (
    <div className="space-y-4">
      {[...theoNgay.entries()].map(([ngay, ds]) => {
        const tongChi = ds
          .filter((t) => t.type === 'expense')
          .reduce((s, t) => s + t.amount, 0);

        return (
          <div key={ngay}>
            <div className="mb-1.5 flex items-baseline justify-between px-1">
              <h3 className="text-sm font-medium">{formatDayLabel(ngay)}</h3>
              {tongChi > 0 && (
                <span className="muted tabular text-xs">−{formatMoney(tongChi)}</span>
              )}
            </div>

            <Card className="divide-y p-0">
              {ds.map((t) => (
                <div key={t.id} className="group flex items-center gap-3 p-3">
                  <CategoryIcon icon={t.category?.icon} color={t.category?.color} />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {t.category?.name ?? 'Không danh mục'}
                    </p>
                    {t.note && <p className="muted truncate text-xs">{t.note}</p>}
                  </div>

                  <span
                    className={`tabular shrink-0 font-semibold ${
                      t.type === 'income' ? 'text-income' : 'text-expense'
                    }`}
                  >
                    {t.type === 'income' ? '+' : '−'}
                    {formatMoney(t.amount)}
                  </span>

                  {!compact && (
                    <Button
                      variant="ghost"
                      size="sm"
                      // Chỉ hiện khi hover/focus để danh sách không rối vì nút xóa
                      className="opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                      onClick={() => {
                        if (confirm('Xóa giao dịch này?')) xoa.mutate(t.id);
                      }}
                      aria-label="Xóa giao dịch"
                    >
                      <Trash2 size={15} className="text-expense" />
                    </Button>
                  )}
                </div>
              ))}
            </Card>
          </div>
        );
      })}

      {hasNextPage && !compact && (
        <Button
          variant="secondary"
          className="w-full"
          loading={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          Xem thêm
        </Button>
      )}
    </div>
  );
}
