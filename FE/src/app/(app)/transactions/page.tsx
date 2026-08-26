'use client';

import { Landmark, RefreshCw, TriangleAlert } from 'lucide-react';
import { Suspense, useState } from 'react';
import { TransactionFilters, type BoLoc } from '@/components/transactions/TransactionFilters';
import { TransactionList } from '@/components/transactions/TransactionList';
import { Button, Card, ErrorState, Skeleton } from '@/components/ui';
import {
  useBalance, useBankAccounts, useSepayStatus, useSyncSepay,
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

      <TransactionList filters={{ q: loc.q, from: loc.from, to: loc.to }} />
    </div>
  );
}
