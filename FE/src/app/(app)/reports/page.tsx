'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, FileText } from 'lucide-react';
import { useState } from 'react';
import { ReportBody } from '@/components/ai/ReportBody';
import { Card, EmptyState, ErrorState, Skeleton, cn } from '@/components/ui';
import { aiApi } from '@/lib/api';
import type { ApiError } from '@/lib/api/client';
import { formatDate, formatPeriodLabel } from '@/lib/format';

/** Nhãn ngắn trên chip màu — khác `formatPeriodLabel` là tên kỳ đầy đủ */
const NHAN_KY = { weekly: 'Tuần', monthly: 'Tháng' } as const;

export default function ReportsPage() {
  const [mo, setMo] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ai', 'insights', 'reports'],
    queryFn: () => aiApi.insights({ kinds: 'weekly,monthly', limit: 50 }),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Báo cáo chi tiêu</h1>
        <p className="muted mt-1 text-sm">
          Báo cáo được tạo tự động khi mỗi tuần và mỗi tháng kết thúc.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <ErrorState message={(error as ApiError).message} onRetry={() => void refetch()} />
        </Card>
      ) : !data?.length ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="Chưa có báo cáo nào"
            description="Hết tuần này, hệ thống sẽ tự tổng hợp và lưu lại báo cáo đầu tiên cho bạn"
          />
        </Card>
      ) : (
        data.map((r) => {
          const dangMo = mo === r.id;
          return (
            <Card key={r.id} className="p-0">
              {/* Bấm cả hàng để mở — vùng bấm rộng, dễ trúng trên điện thoại */}
              <button
                onClick={() => setMo(dangMo ? null : r.id)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                    r.kind === 'weekly'
                      ? 'bg-brand/15 text-brand'
                      : 'bg-blue-500/15 text-blue-500',
                  )}
                >
                  {NHAN_KY[r.kind as keyof typeof NHAN_KY] ?? r.kind}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {formatPeriodLabel(r.kind, r.periodStart, r.periodEnd)}
                  </span>
                  {r.structured?.summary && (
                    <span className="muted line-clamp-1 text-sm">
                      {r.structured.summary}
                    </span>
                  )}
                </span>

                <ChevronDown
                  size={18}
                  className={cn('muted shrink-0 transition', dangMo && 'rotate-180')}
                />
              </button>

              {dangMo && (
                <div className="border-t p-4">
                  <ReportBody insight={r} />
                  <p className="muted mt-4 text-xs">
                    Tạo lúc {formatDate(r.generatedAt ?? r.createdAt ?? '')} · {r.model}
                  </p>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
