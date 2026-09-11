'use client';

import { Eye, EyeOff, RefreshCw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { BalanceCards } from '@/components/dashboard/BalanceCards';
import { CategoryDonut } from '@/components/dashboard/CategoryDonut';
import { KindRatio } from '@/components/dashboard/KindRatio';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { TransactionList } from '@/components/transactions/TransactionList';
import { Button, Card, CardTitle, Segmented } from '@/components/ui';
import { useAnSoDu } from '@/hooks/useAnSoDu';
import { useBankAccounts, useSepayStatus, useSyncSepay } from '@/hooks/useFinance';
import { formatDate } from '@/lib/format';

/** Bao lâu không đồng bộ được thì coi là đáng ngờ */
const NGUONG_IM_LANG_GIO = 72;

const KY = [
  { value: 'today', label: 'Hôm nay' },
  { value: 'week', label: 'Tuần này' },
  { value: 'month', label: 'Tháng này' },
] as const;

export default function DashboardPage() {
  const [period, setPeriod] = useState<(typeof KY)[number]['value']>('month');
  const [anSoDu, doiAnSoDu] = useAnSoDu();
  const { data: taiKhoan } = useBankAccounts();
  const { data: sepay } = useSepayStatus();
  const dongBo = useSyncSepay();

  const tk = taiKhoan?.[0];
  const imLang =
    tk &&
    (!tk.lastSyncedAt ||
      Date.now() - new Date(tk.lastSyncedAt).getTime() > NGUONG_IM_LANG_GIO * 3600_000);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-1.5 text-2xl font-bold">
            Tổng quan
            <button
              type="button"
              onClick={doiAnSoDu}
              className="muted rounded-lg p-1 transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              aria-label={anSoDu ? 'Hiện số tiền' : 'Ẩn số tiền'}
              title={anSoDu ? 'Hiện số tiền' : 'Ẩn số tiền'}
            >
              {anSoDu ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </h1>
          {tk && (
            <p className="muted mt-0.5 text-xs">
              {tk.bankName} · {tk.accountNumber}
              {tk.lastSyncedAt && <> · đồng bộ lần cuối {formatDate(tk.lastSyncedAt)}</>}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Segmented value={period} onChange={setPeriod} options={KY} />

          {/* Đường DUY NHẤT đưa dữ liệu mới vào app khi cron chưa tới lượt */}
          <Button
            variant="secondary"
            disabled={!sepay?.configured}
            loading={dongBo.isPending}
            onClick={() => dongBo.mutate({})}
            title={
              sepay?.configured
                ? 'Kéo giao dịch mới từ SePay'
                : 'Chưa cấu hình SEPAY_API_TOKEN trong .env'
            }
          >
            <RefreshCw size={16} /> Đồng bộ
          </Button>
        </div>
      </div>

      {/*
        Ngân hàng im lặng quá lâu mà KHÔNG hiện là nguy hiểm nhất: app trông vẫn bình
        thường, số dư vẫn có, chỉ là đã cũ — user tưởng mình còn ngần ấy tiền.
      */}
      {imLang && (
        <p className="bg-warning-soft flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs text-warning">
          <TriangleAlert size={13} className="mt-px shrink-0" />
          <span>
            {tk!.lastSyncedAt ? 'Hơn 3 ngày chưa đồng bộ' : 'Chưa đồng bộ lần nào'}
            {sepay?.configured
              ? ' — bấm "Đồng bộ" để kéo về ngay.'
              : ' — chưa cấu hình SEPAY_API_TOKEN trong .env.'}
          </span>
        </p>
      )}

      <BalanceCards period={period} anSoDu={anSoDu} />

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
        <TransactionList filters={{ limit: 8 }} />
      </Card>
    </div>
  );
}
