'use client';

import { Card, CardTitle, ErrorState, Skeleton } from '@/components/ui';
import { useSummary } from '@/hooks/useFinance';
import { formatMoney, formatPercent } from '@/lib/format';

/** Mục tiêu của khung 50/30/20 — hiển thị để user biết mình lệch chuẩn bao nhiêu */
const CHUAN = { need: 0.5, want: 0.3, saving: 0.2 };

const NHAN = {
  need: { ten: 'Cần thiết', mau: '#3b82f6' },
  want: { ten: 'Mong muốn', mau: '#f59e0b' },
  saving: { ten: 'Tiết kiệm', mau: '#10b981' },
} as const;

export function KindRatio({ period }: { period: string }) {
  const { data, isLoading, isError, error, refetch } = useSummary(period);

  if (isLoading) return <Skeleton className="h-48" />;

  if (isError) {
    return (
      <Card>
        <CardTitle>Cơ cấu chi tiêu</CardTitle>
        <ErrorState message={(error as Error)?.message} onRetry={() => void refetch()} />
      </Card>
    );
  }

  // Ẩn hẳn khi chưa có khoản chi nào — biểu đồ rỗng không nói lên điều gì
  if (!data || data.expense === 0) return null;

  return (
    <Card>
      <CardTitle>Cơ cấu chi tiêu · khung 50/30/20</CardTitle>

      {/* Một thanh ngang thay vì 3 thanh riêng: dễ thấy tỉ trọng tương đối hơn */}
      <div className="flex h-3 overflow-hidden rounded-full">
        {(['need', 'want', 'saving'] as const).map((k) => (
          <div
            key={k}
            style={{ width: `${data.kindRatio[k] * 100}%`, background: NHAN[k].mau }}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-2.5">
        {(['need', 'want', 'saving'] as const).map((k) => {
          const thucTe = data.kindRatio[k];
          const lech = thucTe - CHUAN[k];

          return (
            <li key={k} className="flex items-center gap-2 text-sm">
              <span className="size-2.5 rounded-full" style={{ background: NHAN[k].mau }} />
              <span className="flex-1">{NHAN[k].ten}</span>
              <span className="tabular font-medium">{formatMoney(data.byKind[k])}</span>
              <span className="tabular w-11 text-right">{formatPercent(thucTe)}</span>
              {/* Chỉ cảnh báo khi lệch quá 5% — dao động nhỏ là bình thường */}
              <span
                className={`tabular w-14 text-right text-xs ${
                  Math.abs(lech) < 0.05 ? 'muted' : lech > 0 ? 'text-warning' : 'text-brand'
                }`}
              >
                {lech > 0 ? '+' : ''}
                {formatPercent(lech)}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="muted mt-3 text-xs">
        Cột cuối là mức lệch so với khung khuyến nghị (50% cần thiết · 30% mong muốn · 20% tiết kiệm)
      </p>
    </Card>
  );
}
