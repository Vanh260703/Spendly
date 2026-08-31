'use client';

import { Check, Receipt } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, EmptyState, ErrorState, Skeleton, cn } from '@/components/ui';
import { useDanhDauDaXet, useTransactions } from '@/hooks/useFinance';
import type { TxFilters } from '@/lib/api';
import type { ApiError } from '@/lib/api/client';
import { formatMoney } from '@/lib/format';
import type { Transaction } from '@/types';

/** `"2026-08-26T00:15:00Z"` → `"26/08 07:15"` — đủ để đối chiếu, không chiếm chỗ */
function ngayGio(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Sổ giao dịch dạng BẢNG — **chỉ đọc**.
 *
 * Không có nút chia bill ở đây: công nợ thuộc về trang Danh bạ, còn bảng này là bản sao sao
 * kê ngân hàng. Trộn hai việc vào một chỗ làm mờ ranh giới mà chính ranh giới đó mới giữ
 * cho sổ ngân hàng không bị app cắt gọt.
 *
 * Dữ liệu đến từ ngân hàng nên mỗi dòng là một sự kiện có sẵn cấu trúc: thời điểm, nội dung
 * chuyển khoản, số tiền, chiều. Bảng đọc nhanh hơn thẻ vì mắt quét theo cột — nhất là khi
 * cần dò một con số giữa vài chục dòng.
 *
 * **Không có cột danh mục.** Danh mục vẫn tồn tại ở BE nhưng chỉ còn một nhiệm vụ: tách
 * tiền cho mượn ra khỏi tiền tiêu thật. App tự làm việc đó, không có gì để người dùng chọn.
 */
export function TransactionList({ filters = {} }: { filters?: TxFilters }) {
  const {
    data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useTransactions(filters);
  const danhDau = useDanhDauDaXet();

  if (isLoading) return <Skeleton className="h-64" />;

  if (isError) {
    // Lỗi mà hiện "chưa có giao dịch nào" là user tưởng mất sạch dữ liệu
    return (
      <Card>
        <ErrorState message={(error as ApiError).message} onRetry={() => void refetch()} />
      </Card>
    );
  }

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Chưa có giao dịch nào"
        description={'Bấm "Đồng bộ" ở trên để kéo giao dịch từ ngân hàng về.'}
      />
    );
  }

  return (
    <>
      <Card className="!p-0">
        {/* Bảng rộng hơn màn hình thì CUỘN TRONG KHUNG, không đẩy cả trang trôi ngang */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="muted border-b text-left text-xs">
                <th className="px-3 py-2 font-medium whitespace-nowrap">Thời điểm</th>
                <th className="px-3 py-2 font-medium">Nội dung chuyển khoản</th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Số tiền</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>

            <tbody className="divide-y">
              {items.map((t) => (
                <tr key={t.id} className="group">
                  {/*
                    Vạch màu bên trái đánh dấu khoản CHƯA xét. Dùng viền thay vì đổi nền cả
                    dòng: đủ để mắt bắt được khi lướt, mà không làm bảng loang lổ khi có
                    hàng chục dòng chưa xét.
                  */}
                  <td
                    className={cn(
                      'muted tabular border-l-2 px-3 py-2.5 whitespace-nowrap',
                      t.reviewedAt ? 'border-transparent' : 'border-brand',
                    )}
                  >
                    {ngayGio(t.date)}
                  </td>

                  {/* `max-w-0` + `truncate`: nội dung dài không đẩy cột số tiền ra ngoài */}
                  <td className="max-w-0 px-3 py-2.5">
                    <span className="block truncate" title={t.note ?? undefined}>
                      {t.note || '—'}
                    </span>
                  </td>

                  <td
                    className={cn(
                      'tabular px-3 py-2.5 text-right font-semibold whitespace-nowrap',
                      t.type === 'income' ? 'text-income' : 'text-expense',
                    )}
                  >
                    {t.type === 'income' ? '+' : '−'}
                    {formatMoney(t.amount)}
                  </td>

                  <td className="px-1 py-1 whitespace-nowrap">
                    <span className="flex justify-end">
                      {/*
                        Nút "đã xét" luôn hiện với khoản chưa xét (không ẩn sau hover): đây
                        là thao tác chính khi lướt hàng chờ, giấu đi là bắt rê chuột từng dòng.
                        Khoản đã xét thì cho bấm lại để trả về hàng chờ, nhưng ẩn bớt.
                      */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          'transition',
                          t.reviewedAt && 'opacity-0 group-hover:opacity-100 focus:opacity-100',
                        )}
                        loading={danhDau.isPending && danhDau.variables?.id === t.id}
                        onClick={() =>
                          danhDau.mutate({ id: t.id, reviewed: !t.reviewedAt })
                        }
                        aria-label={t.reviewedAt ? 'Bỏ đánh dấu' : 'Đánh dấu đã xét'}
                        title={
                          t.reviewedAt
                            ? 'Đã xét — bấm để trả về hàng chờ'
                            : 'Không có phần trả hộ, đánh dấu đã xét'
                        }
                      >
                        <Check
                          size={15}
                          className={t.reviewedAt ? 'muted' : 'text-ok'}
                        />
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {hasNextPage && (
        <Button
          variant="secondary"
          className="mt-3 w-full"
          loading={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          Xem thêm
        </Button>
      )}
    </>
  );
}
