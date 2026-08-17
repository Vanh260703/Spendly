'use client';

import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardTitle, ErrorState, Skeleton } from '@/components/ui';
import { useTrend } from '@/hooks/useFinance';
import { formatMoney, formatMoneyShort } from '@/lib/format';

export function TrendChart({ period }: { period: string }) {
  const { data, isLoading, isError, error, refetch } = useTrend(period, 'day');

  if (isLoading) return <Skeleton className="h-72" />;

  if (isError) {
    return (
      <Card>
        <CardTitle>Xu hướng thu chi</CardTitle>
        <ErrorState message={(error as Error)?.message} onRetry={() => void refetch()} />
      </Card>
    );
  }

  const duLieu = (data ?? []).map((d) => ({
    ...d,
    // Trục X chỉ hiện ngày/tháng — chuỗi ISO đầy đủ sẽ chồng chữ lên nhau
    nhan: d.bucket.slice(5).replace('-', '/'),
  }));

  return (
    <Card>
      <CardTitle>Xu hướng thu chi</CardTitle>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={duLieu} margin={{ left: -18, right: 4, top: 4 }}>
            <defs>
              <linearGradient id="gThu" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-income)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-income)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gChi" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-expense)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-expense)" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="nhan" tick={{ fontSize: 11 }} stroke="var(--text-muted)" tickLine={false} />
            <YAxis
              tickFormatter={formatMoneyShort}
              tick={{ fontSize: 11 }}
              stroke="var(--text-muted)"
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(v, n) => [formatMoney(Number(v)), n === 'income' ? 'Thu' : 'Chi']}
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                color: 'var(--text)',
              }}
            />
            <Area type="monotone" dataKey="income" stroke="var(--color-income)" fill="url(#gThu)" strokeWidth={2} />
            <Area type="monotone" dataKey="expense" stroke="var(--color-expense)" fill="url(#gChi)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
