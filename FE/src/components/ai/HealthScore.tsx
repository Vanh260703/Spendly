'use client';

import { useQuery } from '@tanstack/react-query';
import { HeartPulse } from 'lucide-react';
import { Card, CardTitle, ErrorState, Skeleton } from '@/components/ui';
import { aiApi } from '@/lib/api';
import type { ApiError } from '@/lib/api/client';

/** Thang điểm tối đa từng phần — khớp với prompt ở BE */
const TOI_DA: Record<string, { nhan: string; max: number }> = {
  savingRate: { nhan: 'Tỷ lệ tiết kiệm', max: 30 },
  budgetAdherence: { nhan: 'Tuân thủ ngân sách', max: 25 },
  emergencyFund: { nhan: 'Quỹ dự phòng', max: 25 },
  debtRatio: { nhan: 'Tỷ lệ nợ', max: 20 },
};

const mauTheoDiem = (d: number) =>
  d >= 75 ? 'text-ok' : d >= 50 ? 'text-warning' : 'text-exceeded';

export function HealthScore() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ai', 'health-score'],
    queryFn: aiApi.healthScore,
    retry: false,
  });

  const s = data?.structured;

  return (
    <Card>
      <CardTitle>
        <span className="flex items-center gap-2">
          <HeartPulse size={18} className="text-brand" /> Sức khỏe tài chính
        </span>
      </CardTitle>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : isError ? (
        <ErrorState message={(error as ApiError).message} onRetry={() => void refetch()} />
      ) : typeof s?.score !== 'number' ? (
        // JSON hỏng thì KHÔNG hiện "0/100" — điểm 0 và không chấm được là hai chuyện khác nhau
        <p className="muted text-sm">
          Chưa chấm được điểm lần này. Thử tải lại trang sau ít phút.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-bold ${mauTheoDiem(s.score)}`}>{s.score}</span>
            <span className="muted text-sm">/ 100</span>
          </div>

          {s?.breakdown && (
            <ul className="space-y-1.5">
              {Object.entries(s.breakdown).map(([k, v]) => {
                const meta = TOI_DA[k];
                if (!meta) return null;
                return (
                  <li key={k} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">{meta.nhan}</span>
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--surface-2)]">
                      <span
                        className="block h-full rounded-full bg-brand"
                        style={{ width: `${Math.min(100, (v / meta.max) * 100)}%` }}
                      />
                    </span>
                    <span className="tabular muted w-12 text-right text-xs">
                      {v}/{meta.max}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {s?.explanation && <p className="muted text-sm">{s.explanation}</p>}
        </div>
      )}
    </Card>
  );
}
