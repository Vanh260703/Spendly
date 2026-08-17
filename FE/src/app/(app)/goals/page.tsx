'use client';

import { CalendarClock, CircleAlert, Plus, Target, TriangleAlert, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Button, Card, EmptyState, ErrorState, Field, Input, Modal, MoneyInput, Progress, Select, Skeleton,
} from '@/components/ui';
import { useBalance, useContribute, useCreateGoal, useDeleteGoal, useGoals } from '@/hooks/useFinance';
import { formatDate, formatMoney } from '@/lib/format';
import type { Goal } from '@/types';

export default function GoalsPage() {
  const { data: goals, isLoading, isError, error, refetch } = useGoals();
  const { data: balance } = useBalance();
  const tao = useCreateGoal();
  const xoa = useDeleteGoal();
  const nap = useContribute();

  const [moTao, setMoTao] = useState(false);
  const [napVao, setNapVao] = useState<Goal | null>(null);
  const [soTien, setSoTien] = useState<number | ''>('');
  const [form, setForm] = useState<{ name: string; targetAmount: number | ''; horizon: string; deadline: string; monthlyContribution: number | '' }>({ name: '', targetAmount: '', horizon: 'short', deadline: '', monthlyContribution: '' });

  const guiTao = (e: React.FormEvent) => {
    e.preventDefault();
    tao.mutate(
      {
        name: form.name,
        horizon: form.horizon,
        targetAmount: Number(form.targetAmount),
        deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
        monthlyContribution: form.monthlyContribution ? Number(form.monthlyContribution) : null,
      },
      { onSuccess: () => { setMoTao(false); setForm({ name: '', targetAmount: '', horizon: 'short', deadline: '', monthlyContribution: '' }); } },
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Mục tiêu</h1>
        <Button onClick={() => setMoTao(true)}><Plus size={18} /> Tạo mục tiêu</Button>
      </div>

      {/* Nạp vào mục tiêu không làm giảm số dư — nên phải cho thấy "tự do tiêu" còn bao nhiêu */}
      {balance && balance.committedToGoals > 0 && (
        <Card className="flex items-center justify-between text-sm">
          <span className="muted">Đã cam kết cho mục tiêu</span>
          <span className="tabular font-medium">{formatMoney(balance.committedToGoals)}</span>
          <span className="muted">·</span>
          <span className="muted">Tự do tiêu</span>
          <span className="tabular font-medium text-brand">{formatMoney(balance.freeToSpend)}</span>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : isError ? (
        <Card>
          <ErrorState message={(error as Error)?.message} onRetry={() => void refetch()} />
        </Card>
      ) : !goals?.length ? (
        <Card>
          <EmptyState
            icon={Target}
            title="Chưa có mục tiêu nào"
            description="Đặt mục tiêu để biết mỗi tháng cần để dành bao nhiêu"
            action={<Button onClick={() => setMoTao(true)}>Tạo mục tiêu đầu tiên</Button>}
          />
        </Card>
      ) : (
        goals.map((g) => (
          <Card key={g.id}>
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {g.name}
                  {g.status === 'achieved' && <span className="ml-2 text-sm text-brand">✓ đã đạt</span>}
                </p>
                <p className="muted text-xs">
                  {g.horizon === 'short' ? 'Ngắn hạn' : 'Dài hạn'}
                  {g.deadline && <> · hạn {formatDate(g.deadline)}</>}
                  {g.monthsLeft > 0 && <> · còn {g.monthsLeft} kỳ</>}
                </p>
              </div>
              <Button
                variant="ghost" size="sm"
                onClick={() => { if (confirm(`Xóa mục tiêu "${g.name}"?`)) xoa.mutate(g.id); }}
                aria-label="Xóa mục tiêu"
              >
                <Trash2 size={15} className="text-expense" />
              </Button>
            </div>

            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="tabular font-semibold">{formatMoney(g.currentAmount)}</span>
              <span className="muted tabular">/ {formatMoney(g.targetAmount)}</span>
            </div>

            <Progress value={g.progress} tone={g.status === 'achieved' ? 'ok' : 'brand'} />

            {/* Ba cảnh báo TÁCH BIỆT — gộp lại sẽ không biết phải xử lý cách nào */}
            {g.status === 'active' && (
              <div className="mt-2 space-y-1.5 text-xs">
                {/* 1. Quá hạn: nặng nhất, đưa lên đầu */}
                {g.overdue && (
                  <p className="flex items-start gap-1.5 text-expense">
                    <CircleAlert size={14} className="mt-px shrink-0" />
                    Đã quá hạn mà còn thiếu {formatMoney(g.remaining)}. Hãy dời hạn hoặc
                    giảm số tiền mục tiêu.
                  </p>
                )}

                {/* 2. Kế hoạch không khả thi ngay từ đầu */}
                {!g.overdue && g.onTrack === false && g.requiredMonthly && (
                  <p className="flex items-start gap-1.5 text-warning">
                    <TriangleAlert size={14} className="mt-px shrink-0" />
                    Cần {formatMoney(g.requiredMonthly)}/kỳ mới kịp hạn, hiện mới định trích{' '}
                    {formatMoney(g.monthlyContribution ?? 0)}/kỳ
                  </p>
                )}

                {/*
                  3. Kỳ này chưa nạp — khác hẳn với (2). Kế hoạch có thể rất ổn nhưng
                  tháng này bạn quên nạp, và mỗi kỳ bỏ lỡ sẽ đội số tiền các kỳ sau lên.
                */}
                {g.requiredMonthly !== null && g.contributedThisPeriod === 0 && !g.overdue && (
                  <p className="muted flex items-start gap-1.5">
                    <CalendarClock size={14} className="mt-px shrink-0" />
                    Kỳ này chưa nạp đồng nào. Bỏ lỡ kỳ này thì các kỳ sau phải nạp nhiều hơn.
                  </p>
                )}

                {g.contributedThisPeriod > 0 && (
                  <p className="flex items-start gap-1.5 text-brand">
                    <CalendarClock size={14} className="mt-px shrink-0" />
                    Kỳ này đã nạp {formatMoney(g.contributedThisPeriod)}
                    {g.requiredMonthly !== null &&
                      g.contributedThisPeriod < g.requiredMonthly &&
                      ` — còn thiếu ${formatMoney(g.requiredMonthly - g.contributedThisPeriod)} để đạt mức cần`}
                  </p>
                )}
              </div>
            )}

            {g.status === 'active' && (
              <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => setNapVao(g)}>
                Nạp tiền
              </Button>
            )}
          </Card>
        ))
      )}

      <Modal open={moTao} onClose={() => setMoTao(false)} title="Tạo mục tiêu">
        <form onSubmit={guiTao} className="space-y-4">
          <Field label="Tên mục tiêu">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mua Macbook" required />
          </Field>
          <Field label="Số tiền cần">
            <MoneyInput value={form.targetAmount} onChange={(v) => setForm({ ...form, targetAmount: v })} placeholder="0" required />
          </Field>
          <Field label="Thời hạn">
            <Select value={form.horizon} onChange={(e) => setForm({ ...form, horizon: e.target.value })}>
              <option value="short">Ngắn hạn (dưới 1 năm)</option>
              <option value="long">Dài hạn</option>
            </Select>
          </Field>
          <Field label="Hạn chót" hint="Có hạn thì app tính được mỗi tháng cần để dành bao nhiêu">
            <Input value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} type="date" />
          </Field>
          <Field label="Dự định trích mỗi tháng">
            <MoneyInput value={form.monthlyContribution} onChange={(v) => setForm({ ...form, monthlyContribution: v })} placeholder="0" />
          </Field>
          <Button type="submit" loading={tao.isPending} className="w-full">Tạo</Button>
        </form>
      </Modal>

      <Modal open={!!napVao} onClose={() => setNapVao(null)} title={`Nạp vào "${napVao?.name}"`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!napVao) return;
            nap.mutate(
              { id: napVao.id, amount: Number(soTien) },
              { onSuccess: () => { setNapVao(null); setSoTien(''); } },
            );
          }}
          className="space-y-4"
        >
          <Field
            label="Số tiền nạp"
            hint={`Tối đa ${formatMoney(balance?.freeToSpend ?? 0)} — đây là gắn nhãn cho tiền, không phải khoản chi`}
          >
            <MoneyInput value={soTien} onChange={setSoTien} placeholder="0" required autoFocus className="text-lg font-semibold" />
          </Field>
          <Button type="submit" loading={nap.isPending} className="w-full">Nạp</Button>
        </form>
      </Modal>
    </div>
  );
}
