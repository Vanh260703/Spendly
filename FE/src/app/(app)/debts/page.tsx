'use client';

import { PiggyBank, Plus } from 'lucide-react';
import { useState } from 'react';
import {
  Button, Card, CardTitle, EmptyState, ErrorState, Field, Input, Modal, MoneyInput, Progress, Select, Skeleton,
} from '@/components/ui';
import { useCreateDebt, useDebts, usePayDebt, usePayoffPlan } from '@/hooks/useFinance';
import { formatDate, formatMoney } from '@/lib/format';
import type { Debt } from '@/types';

export default function DebtsPage() {
  const { data: debts, isLoading, isError, error, refetch } = useDebts();
  const tao = useCreateDebt();
  const tra = usePayDebt();

  const [strategy, setStrategy] = useState('avalanche');
  const [extra, setExtra] = useState(0);
  const { data: plan } = usePayoffPlan(strategy, extra);

  const [moTao, setMoTao] = useState(false);
  const [traCho, setTraCho] = useState<Debt | null>(null);
  const [soTien, setSoTien] = useState<number | ''>('');
  const [form, setForm] = useState<{ name: string; principal: number | ''; interestRate: string; minPayment: number | ''; dueDay: string }>({ name: '', principal: '', interestRate: '', minPayment: '', dueDay: '15' });

  const guiTao = (e: React.FormEvent) => {
    e.preventDefault();
    tao.mutate(
      {
        name: form.name,
        principal: Number(form.principal),
        interestRate: Number(form.interestRate),
        minPayment: Number(form.minPayment),
        dueDay: Number(form.dueDay),
        strategy,
      },
      { onSuccess: () => { setMoTao(false); setForm({ name: '', principal: '', interestRate: '', minPayment: '', dueDay: '15' }); } },
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Khoản nợ</h1>
        <Button onClick={() => setMoTao(true)}><Plus size={18} /> Thêm khoản nợ</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-32" />
      ) : isError ? (
        <Card>
          <ErrorState message={(error as Error)?.message} onRetry={() => void refetch()} />
        </Card>
      ) : !debts?.length ? (
        <Card>
          <EmptyState icon={PiggyBank} title="Không có khoản nợ nào" description="Tuyệt vời — bạn đang không nợ ai cả" />
        </Card>
      ) : (
        <>
          {debts.map((d) => (
            <Card key={d.id}>
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <p className="font-medium">{d.name}</p>
                  <p className="muted text-xs">
                    Lãi {d.interestRate}%/năm · trả tối thiểu {formatMoney(d.minPayment)}/tháng · hạn ngày {d.dueDay}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setTraCho(d)}>Trả nợ</Button>
              </div>

              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="tabular font-semibold text-expense">Còn {formatMoney(d.remaining)}</span>
                <span className="muted tabular">đã trả {formatMoney(d.paid)}</span>
              </div>
              <Progress value={d.progress} tone="ok" />
            </Card>
          ))}

          <Card>
            <CardTitle>Kế hoạch trả nợ</CardTitle>

            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Chiến lược">
                <Select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                  <option value="avalanche">Lãi cao trước — tốn ít lãi nhất</option>
                  <option value="snowball">Khoản nhỏ trước — nhanh thấy kết quả</option>
                </Select>
              </Field>
              <Field label="Trả thêm mỗi tháng" hint="Đây là đòn bẩy chính rút ngắn thời gian">
                <MoneyInput value={extra || ''} onChange={(v) => setExtra(v === '' ? 0 : v)} placeholder="0" />
              </Field>
            </div>

            {plan && (
              <div className="mt-3 space-y-2">
                {plan.debtFreeDate ? (
                  <p className="text-sm">
                    Hết nợ vào <strong>{formatDate(plan.debtFreeDate)}</strong> ({plan.months} tháng) · tổng lãi{' '}
                    <strong className="text-expense">{formatMoney(plan.totalInterest)}</strong>
                  </p>
                ) : (
                  // Xảy ra khi lãi mỗi tháng lớn hơn số tiền trả — cần cảnh báo rõ
                  <p className="text-sm text-expense">
                    Mức trả hiện tại không đủ để tất toán — lãi phát sinh nhanh hơn tiền trả. Hãy tăng khoản trả thêm.
                  </p>
                )}

                <ol className="space-y-1.5">
                  {plan.order.map((o, i) => (
                    <li key={o.debtId} className="flex items-center gap-2 text-sm">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs">
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate">{o.name}</span>
                      <span className="muted text-xs">{formatDate(o.payoffDate)}</span>
                      <span className="tabular text-xs text-expense">+{formatMoney(o.totalInterest)} lãi</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </Card>
        </>
      )}

      <Modal open={moTao} onClose={() => setMoTao(false)} title="Thêm khoản nợ">
        <form onSubmit={guiTao} className="space-y-4">
          <Field label="Tên khoản nợ">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Vay mua xe" required />
          </Field>
          <Field label="Số tiền vay">
            <MoneyInput value={form.principal} onChange={(v) => setForm({ ...form, principal: v })} placeholder="0" required />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Lãi suất (%/năm)">
              <Input value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} type="number" step="0.1" placeholder="9.5" required />
            </Field>
            <Field label="Ngày đến hạn">
              <Input value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} type="number" min="1" max="28" required />
            </Field>
          </div>
          <Field label="Trả tối thiểu mỗi tháng">
            <MoneyInput value={form.minPayment} onChange={(v) => setForm({ ...form, minPayment: v })} placeholder="0" required />
          </Field>
          <Button type="submit" loading={tao.isPending} className="w-full">Thêm</Button>
        </form>
      </Modal>

      <Modal open={!!traCho} onClose={() => setTraCho(null)} title={`Trả nợ "${traCho?.name}"`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!traCho) return;
            tra.mutate({ id: traCho.id, amount: Number(soTien) }, { onSuccess: () => { setTraCho(null); setSoTien(''); } });
          }}
          className="space-y-4"
        >
          <Field label="Số tiền trả" hint={`Còn nợ ${formatMoney(traCho?.remaining ?? 0)}`}>
            <MoneyInput value={soTien} onChange={setSoTien} placeholder="0" required autoFocus className="text-lg font-semibold" />
          </Field>
          <Button type="submit" loading={tra.isPending} className="w-full">Ghi nhận</Button>
        </form>
      </Modal>
    </div>
  );
}
