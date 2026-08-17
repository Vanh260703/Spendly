'use client';

import { PieChart as PieIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardTitle, CategoryIcon, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { useByCategory } from '@/hooks/useFinance';
import { formatMoney, formatPercent } from '@/lib/format';

export function CategoryDonut({ period }: { period: string }) {
  const { data, isLoading, isError, error, refetch } = useByCategory(period, 'expense');

  if (isLoading) return <Skeleton className="h-80" />;

  if (isError) {
    return (
      <Card>
        <CardTitle>Chi theo danh mục</CardTitle>
        <ErrorState message={(error as Error)?.message} onRetry={() => void refetch()} />
      </Card>
    );
  }

  if (!data?.length) {
    return (
      <Card>
        <CardTitle>Chi theo danh mục</CardTitle>
        <EmptyState icon={PieIcon} title="Chưa có khoản chi nào trong kỳ" />
      </Card>
    );
  }

  // Chỉ vẽ 6 danh mục lớn nhất, phần còn lại gộp "Khác" — nhiều lát mỏng
  // vừa không đọc được vừa làm chú thích tràn màn hình
  const top = data.slice(0, 6);
  const conLai = data.slice(6).reduce((s, c) => s + c.total, 0);
  const duLieu = [
    ...top.map((c) => ({ name: c.category.name, value: c.total, color: c.category.color })),
    ...(conLai > 0 ? [{ name: 'Khác', value: conLai, color: '#94a3b8' }] : []),
  ];

  const tong = data.reduce((s, c) => s + c.total, 0);

  return (
    <Card>
      <CardTitle>Chi theo danh mục</CardTitle>

      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={duLieu}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="88%"
              paddingAngle={2}
            >
              {duLieu.map((d) => (
                <Cell key={d.name} fill={d.color} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => formatMoney(Number(v))}
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                color: 'var(--text)',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-3 space-y-2">
        {top.map((c) => (
          <li key={c.category.id} className="flex items-center gap-2 text-sm">
            <CategoryIcon icon={c.category.icon} color={c.category.color} size="sm" />
            <span className="flex-1 truncate">{c.category.name}</span>
            {/* Tần suất: "11 lần" là thứ phân biệt vấn đề tần suất với vấn đề mức chi */}
            <span className="muted shrink-0 text-xs">{c.count} lần</span>
            <span className="tabular shrink-0 font-medium">{formatMoney(c.total)}</span>
            <span className="muted tabular w-10 shrink-0 text-right text-xs">
              {formatPercent(c.total / tong)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
