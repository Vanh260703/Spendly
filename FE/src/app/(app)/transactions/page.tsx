'use client';

import { Suspense, useState } from 'react';
import { DateRangeFilter } from '@/components/transactions/DateRangeFilter';
import { TransactionFilters, type BoLoc } from '@/components/transactions/TransactionFilters';
import { TransactionList } from '@/components/transactions/TransactionList';
import { Skeleton } from '@/components/ui';

/**
 * Giao dịch — nơi DUY NHẤT để xác nhận và gán danh mục cho các khoản ngân hàng vừa kéo về.
 *
 * Số dư/xu hướng/biểu đồ đã có ở `/dashboard` — trang này không lặp lại, chỉ tập trung vào
 * MỘT việc: soát từng dòng "Chưa phân loại" và gán đúng danh mục.
 */
export default function GiaoDichPage() {
  const [khoang, setKhoang] = useState<{ from?: string; to?: string }>({});
  const [locSo, setLocSo] = useState<BoLoc>({});

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Giao dịch</h1>

      <div className="space-y-3">
        <Suspense fallback={<Skeleton className="h-11" />}>
          <DateRangeFilter onChange={setKhoang} />
        </Suspense>

        <Suspense fallback={<Skeleton className="h-11" />}>
          <TransactionFilters onChange={setLocSo} />
        </Suspense>

        <TransactionList
          filters={{ q: locSo.q, from: khoang.from, to: khoang.to, unreviewed: locSo.unreviewed }}
        />
      </div>
    </div>
  );
}
