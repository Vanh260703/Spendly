'use client';

import { ArrowDownLeft, ArrowUpRight, Landmark, RefreshCw, TriangleAlert } from 'lucide-react';
import { Suspense, useState } from 'react';
import { TransactionFilters, type BoLoc } from '@/components/transactions/TransactionFilters';
import { TransactionList } from '@/components/transactions/TransactionList';
import { Button, Card, ErrorState, Skeleton } from '@/components/ui';
import {
  useBalance, useBankAccounts, useSepayStatus, useSummary, useSyncSepay,
} from '@/hooks/useFinance';
import type { ApiError } from '@/lib/api/client';
import { formatDate, formatMoney } from '@/lib/format';

/** Bao lâu không đồng bộ được thì coi là đáng ngờ */
const NGUONG_IM_LANG_GIO = 72;

/**
 * Dòng tiền — màn hình chính của app.
 *
 * Gộp số dư + danh sách giao dịch vào một trang thay vì tách dashboard riêng: app chỉ làm
 * hai việc, mà một trong hai lại chia thành hai màn hình thì người dùng phải nhớ cái nào ở
 * đâu mà chẳng được gì thêm.
 */
export default function DongTienPage() {
  const balance = useBalance();
  const { data: taiKhoan } = useBankAccounts();
  const { data: sepay } = useSepayStatus();
  const dongBo = useSyncSepay();

  const [loc, setLoc] = useState<BoLoc>({});
  // Tổng thu/chi bám theo ĐÚNG bộ lọc ngày — đặt khoảng là tháng thì ra số của tháng đó
  const { data: tong } = useSummary({ from: loc.from, to: loc.to });

  const b = balance.data;
  const tk = taiKhoan?.[0];
  const imLang =
    tk &&
    (!tk.lastSyncedAt ||
      Date.now() - new Date(tk.lastSyncedAt).getTime() > NGUONG_IM_LANG_GIO * 3600_000);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* ————— Số dư ————— */}
      {balance.isError ? (
        // Hiện "0đ" khi lỗi là tệ nhất trong mọi trạng thái sai — user tưởng hết sạch tiền
        <Card>
          <ErrorState
            message={(balance.error as ApiError).message}
            onRetry={() => void balance.refetch()}
          />
        </Card>
      ) : balance.isLoading ? (
        <Skeleton className="h-16" />
      ) : (
        <Card className="bg-brand !py-3 text-white">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs opacity-80">
                <Landmark size={13} />
                {tk ? `${tk.bankName} · ${tk.accountNumber}` : 'Chưa liên kết tài khoản'}
              </div>
              {/* Số dư là con số quan trọng nhất nhưng không cần chiếm cả màn hình —
                  bảng bên dưới mới là thứ người ta ngồi đọc lâu */}
              <p className="tabular text-xl font-bold">{formatMoney(b?.currentBalance ?? 0)}</p>
            </div>

            {/*
              Nút này là đường DUY NHẤT đưa dữ liệu mới vào app khi cron chưa tới lượt —
              app tắt vài ngày rồi bật lại thì bấm một cái là đủ. Chưa cấu hình token thì
              disable kèm lý do, không giấu nút đi: giấu là user không biết tính năng tồn tại.
            */}
            <Button
              variant="ghost"
              size="sm"
              className="!text-white shrink-0 hover:bg-white/15"
              disabled={!sepay?.configured}
              loading={dongBo.isPending}
              onClick={() => dongBo.mutate({})}
              title={
                sepay?.configured
                  ? 'Kéo giao dịch mới từ SePay'
                  : 'Chưa cấu hình SEPAY_API_TOKEN trong .env'
              }
            >
              <RefreshCw size={15} /> Đồng bộ
            </Button>
          </div>

          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] opacity-80">
            {(b?.owedToMe ?? 0) > 0 && <span>Bạn bè nợ: {formatMoney(b!.owedToMe)}</span>}
            {(b?.owedByMe ?? 0) > 0 && <span>Bạn nợ: {formatMoney(b!.owedByMe)}</span>}
            {b?.lastSyncedAt && <span>Đồng bộ {formatDate(b.lastSyncedAt)}</span>}
          </div>

          {/*
            Ngân hàng im lặng quá lâu mà KHÔNG hiện là nguy hiểm nhất: app trông vẫn bình
            thường, số dư vẫn có, chỉ là đã cũ — user tưởng mình còn ngần ấy tiền.
          */}
          {imLang && (
            <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-black/15 px-2 py-1.5 text-[11px]">
              <TriangleAlert size={13} className="mt-px shrink-0" />
              <span>
                {tk!.lastSyncedAt
                  ? 'Hơn 3 ngày chưa đồng bộ'
                  : 'Chưa đồng bộ lần nào'}
                {sepay?.configured
                  ? ' — bấm "Đồng bộ" để kéo về ngay.'
                  : ' — chưa cấu hình SEPAY_API_TOKEN trong .env.'}
              </span>
            </p>
          )}
        </Card>
      )}

      {/*
        `useSearchParams()` cần bọc Suspense khi build tĩnh — Next prerender trang trước khi
        biết query string, nên phần đọc query phải chờ tới lúc chạy ở trình duyệt.
      */}
      <Suspense fallback={<Skeleton className="h-10" />}>
        <TransactionFilters onChange={setLoc} />
      </Suspense>

      {/* ————— Tiền vào / tiền ra của khoảng đang lọc ————— */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="!py-3">
          <div className="muted flex items-center gap-1.5 text-xs">
            <ArrowDownLeft size={14} className="text-income" /> Tiền vào
          </div>
          <p className="tabular mt-1 text-xl font-bold text-income">
            {formatMoney(tong?.income ?? 0)}
          </p>
          {/*
            Chỉ hiện dòng phụ khi con số ngân hàng KHÁC con số thực — nếu không thì mỗi ô
            luôn có hai dòng giống nhau, thành nhiễu.
          */}
          {(tong?.repaidInPeriod ?? 0) > 0 && (
            <p className="muted mt-0.5 text-[11px]">
              Ngân hàng cộng {formatMoney(tong!.incomeGross)} · trừ{' '}
              {formatMoney(tong!.repaidInPeriod)} bạn bè trả lại
            </p>
          )}
        </Card>

        <Card className="!py-3">
          <div className="muted flex items-center gap-1.5 text-xs">
            <ArrowUpRight size={14} className="text-expense" /> Tiền ra
          </div>
          <p className="tabular mt-1 text-xl font-bold text-expense">
            {formatMoney(tong?.expense ?? 0)}
          </p>
          {(tong?.lentInPeriod ?? 0) > 0 && (
            <p className="muted mt-0.5 text-[11px]">
              Ngân hàng trừ {formatMoney(tong!.expenseGross)} · trừ{' '}
              {formatMoney(tong!.lentInPeriod)} cho mượn
            </p>
          )}
        </Card>
      </div>

      <TransactionList
        filters={{ q: loc.q, from: loc.from, to: loc.to, unreviewed: loc.unreviewed }}
      />
    </div>
  );
}
