'use client';

import { ArrowDownLeft, ArrowUpRight, Lock, Users, Wallet } from 'lucide-react';
import { Card, ErrorState, Skeleton } from '@/components/ui';
import { useBalance, useSummary } from '@/hooks/useFinance';
import { formatMoney, formatPercent } from '@/lib/format';

export function BalanceCards({ period }: { period: string }) {
  const balance = useBalance();
  const summary = useSummary(period);

  // Hiện "0đ" khi lỗi là tệ nhất trong mọi trạng thái sai — user tưởng mình hết sạch tiền
  if (balance.isError || summary.isError) {
    return (
      <Card>
        <ErrorState
          message={(balance.error ?? summary.error as Error)?.message}
          onRetry={() => {
            void balance.refetch();
            void summary.refetch();
          }}
        />
      </Card>
    );
  }

  if (balance.isLoading || summary.isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  const b = balance.data;
  const s = summary.data;
  const doiChi = s?.comparison.changePercent;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* Số dư là con số quan trọng nhất → chiếm ô đầu, dùng màu thương hiệu */}
      <Card className="bg-brand text-white">
        <div className="flex items-center gap-2 text-sm opacity-90">
          <Wallet size={16} /> Số tiền hiện có
        </div>
        <p className="tabular mt-2 text-2xl font-bold">{formatMoney(b?.currentBalance ?? 0)}</p>
        {((b?.committedToGoals ?? 0) > 0 || (b?.owedByMe ?? 0) > 0) && (
          <p className="mt-1 flex items-center gap-1 text-xs opacity-90">
            <Lock size={12} /> Tự do tiêu: {formatMoney(b?.freeToSpend ?? 0)}
          </p>
        )}
        {/*
          Tiền bạn bè đang nợ nằm NGOÀI ví nên không cộng vào số dư — hiện riêng để user
          biết còn khoản sẽ về, chứ tuyệt đối không gộp vào "tự do tiêu": tiêu tiền chưa
          về tay là tiêu khống.
        */}
        {(b?.owedToMe ?? 0) > 0 && (
          <p className="mt-1 flex items-center gap-1 text-xs opacity-90">
            <Users size={12} /> Bạn bè nợ: {formatMoney(b?.owedToMe ?? 0)}
          </p>
        )}
      </Card>

      <Card>
        <div className="muted flex items-center gap-2 text-sm">
          <ArrowDownLeft size={16} className="text-income" /> Thu trong kỳ
        </div>
        <p className="tabular mt-2 text-2xl font-bold text-income">
          {formatMoney(s?.income ?? 0)}
        </p>
      </Card>

      <Card>
        <div className="muted flex items-center gap-2 text-sm">
          <ArrowUpRight size={16} className="text-expense" /> Chi trong kỳ
        </div>
        <p className="tabular mt-2 text-2xl font-bold text-expense">
          {formatMoney(s?.expense ?? 0)}
        </p>
        {/* null = kỳ trước không có dữ liệu, hiện "so sánh" lúc đó là bịa */}
        {doiChi !== null && doiChi !== undefined && (
          <p className={`mt-1 text-xs ${doiChi > 0 ? 'text-expense' : 'text-income'}`}>
            {doiChi > 0 ? '↑' : '↓'} {formatPercent(Math.abs(doiChi))} so với kỳ trước
          </p>
        )}
      </Card>

      <Card>
        <div className="muted text-sm">Chênh lệch</div>
        <p
          className={`tabular mt-2 text-2xl font-bold ${
            (s?.net ?? 0) >= 0 ? 'text-income' : 'text-expense'
          }`}
        >
          {formatMoney(s?.net ?? 0, { sign: true })}
        </p>
        <p className="muted mt-1 text-xs">
          {(s?.net ?? 0) >= 0 ? 'Bạn đang để dành được' : 'Bạn đang tiêu quá thu'}
        </p>
      </Card>
    </div>
  );
}
