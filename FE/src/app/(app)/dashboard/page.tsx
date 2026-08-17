'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { BalanceCards } from '@/components/dashboard/BalanceCards';
import { CategoryDonut } from '@/components/dashboard/CategoryDonut';
import { KindRatio } from '@/components/dashboard/KindRatio';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { QuickAddForm } from '@/components/transactions/QuickAddForm';
import { TransactionList } from '@/components/transactions/TransactionList';
import { Button, Card, CardTitle, Modal, cn } from '@/components/ui';

const KY = [
  { value: 'today', label: 'Hôm nay' },
  { value: 'week', label: 'Tuần này' },
  { value: 'month', label: 'Tháng này' },
];

export default function DashboardPage() {
  const [period, setPeriod] = useState('month');
  const [moForm, setMoForm] = useState(false);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Tổng quan</h1>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-[var(--surface-2)] p-1">
            {KY.map((k) => (
              <button
                key={k.value}
                onClick={() => setPeriod(k.value)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm transition',
                  period === k.value ? 'bg-brand text-white' : 'muted',
                )}
              >
                {k.label}
              </button>
            ))}
          </div>

          <Button onClick={() => setMoForm(true)}>
            <Plus size={18} /> Ghi khoản
          </Button>
        </div>
      </div>

      <BalanceCards period={period} />

      <div className="grid gap-4 lg:grid-cols-2">
        <TrendChart period={period} />
        <CategoryDonut period={period} />
      </div>

      <KindRatio period={period} />

      <Card>
        <CardTitle
          action={
            <Link href="/transactions" className="text-sm text-brand">
              Xem tất cả
            </Link>
          }
        >
          Giao dịch gần đây
        </CardTitle>
        <TransactionList filters={{ limit: 8 }} compact />
      </Card>

      <Modal open={moForm} onClose={() => setMoForm(false)} title="Ghi khoản thu chi">
        <QuickAddForm onDone={() => setMoForm(false)} />
      </Modal>
    </div>
  );
}
