'use client';

import { ChartPie, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { BudgetHistory } from '@/components/budgets/BudgetHistory';
import {
  Button, Card, CardTitle, CategoryIcon, EmptyState, ErrorState, Field, Modal, MoneyInput, Progress, Select, Skeleton,
} from '@/components/ui';
import { useBudgets, useCategories, useCreateBudget, useDeleteBudget } from '@/hooks/useFinance';
import { formatMoney, formatPercent } from '@/lib/format';

export default function BudgetsPage() {
  const { data: budgets, isLoading, isError, error, refetch } = useBudgets();
  const { data: categories } = useCategories({ type: 'expense' });
  const tao = useCreateBudget();
  const xoa = useDeleteBudget();

  const [mo, setMo] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [rollover, setRollover] = useState(false);

  const guiForm = (e: React.FormEvent) => {
    e.preventDefault();
    tao.mutate(
      { categoryId: categoryId || null, amount: Number(amount), rollover },
      { onSuccess: () => { setMo(false); setAmount(''); setCategoryId(''); setRollover(false); } },
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Ngân sách</h1>
        <Button onClick={() => setMo(true)}>
          <Plus size={18} /> Đặt hạn mức
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : isError ? (
        <Card>
          <ErrorState message={(error as Error)?.message} onRetry={() => void refetch()} />
        </Card>
      ) : !budgets?.length ? (
        <Card>
          <EmptyState
            icon={ChartPie}
            title="Chưa đặt ngân sách nào"
            description="Đặt hạn mức cho danh mục hay tiêu quá tay để được cảnh báo sớm"
            action={<Button onClick={() => setMo(true)}>Đặt hạn mức đầu tiên</Button>}
          />
        </Card>
      ) : (
        budgets.map((b) => (
          <Card key={b.id}>
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                {b.category && <CategoryIcon icon={b.category.icon} color={b.category.color} size="sm" />}
                <div>
                <p className="font-medium">{b.category?.name ?? 'Toàn bộ chi tiêu'}</p>
                <p className="muted text-xs">
                  {b.period === 'monthly' ? 'Hằng tháng' : 'Hằng tuần'}
                  {/* rolloverIn có DẤU: âm nghĩa là kỳ trước đã tiêu vượt */}
                  {b.rollover && b.rolloverIn !== 0 && (
                    <> · mang sang {formatMoney(b.rolloverIn, { sign: true })}</>
                  )}
                </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => { if (confirm('Xóa ngân sách này?')) xoa.mutate(b.id); }}
                aria-label="Xóa ngân sách"
              >
                <Trash2 size={15} className="text-expense" />
              </Button>
            </div>

            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="tabular font-semibold">{formatMoney(b.spent)}</span>
              {/* Mẫu số là effectiveAmount (đã cộng rollover), không phải amount gốc */}
              <span className="muted tabular">/ {formatMoney(b.effectiveAmount)}</span>
            </div>

            <Progress value={b.progress} tone={b.status} />

            <p
              className={`mt-1.5 text-xs ${
                b.status === 'exceeded' ? 'text-expense'
                : b.status === 'warning' ? 'text-warning' : 'muted'
              }`}
            >
              {b.status === 'exceeded'
                ? `Đã vượt ${formatMoney(Math.abs(b.remaining))}`
                : `Còn ${formatMoney(b.remaining)} · đã dùng ${formatPercent(b.progress)}`}
            </p>
          </Card>
        ))
      )}

      <BudgetHistory />

      <Modal open={mo} onClose={() => setMo(false)} title="Đặt hạn mức chi">
        <form onSubmit={guiForm} className="space-y-4">
          <Field label="Danh mục" hint="Để trống = áp cho toàn bộ chi tiêu">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Toàn bộ chi tiêu</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Hạn mức mỗi tháng">
            <MoneyInput value={amount} onChange={setAmount} placeholder="0" required />
          </Field>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={rollover}
              onChange={(e) => setRollover(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--color-brand)]"
            />
            <span className="text-sm">
              Cộng dồn chênh lệch sang kỳ sau
              <span className="muted block text-xs">
                Dư thì được cộng thêm, vượt thì bị trừ bớt. Giới hạn ±50% hạn mức gốc.
              </span>
            </span>
          </label>

          <Button type="submit" loading={tao.isPending} className="w-full">Lưu</Button>
        </form>
      </Modal>
    </div>
  );
}
