'use client';

import { Landmark, Plus, TriangleAlert, Unlink } from 'lucide-react';
import { useState } from 'react';
import {
  Button, Card, CardTitle, ErrorState, Field, Input, Modal, Skeleton, cn,
} from '@/components/ui';
import { useBankAccounts, useLinkBankAccount, useUnlinkBankAccount } from '@/hooks/useFinance';
import type { ApiError } from '@/lib/api/client';
import { formatDate, formatMoney } from '@/lib/format';

/** Bao lâu không nhận webhook thì coi là đáng ngờ */
const NGUONG_IM_LANG_GIO = 72;

/**
 * Tài khoản ngân hàng — **nguồn dữ liệu duy nhất của app**.
 *
 * Không có tài khoản nào thì app rỗng: giao dịch chỉ đến từ webhook SePay, không nhập tay.
 * Vì vậy màn hình này phải nói rõ phải làm gì tiếp, không chỉ hiện danh sách trống.
 */
export function BankAccountCard() {
  const { data, isLoading, isError, error, refetch } = useBankAccounts();
  const lienKet = useLinkBankAccount();
  const goLienKet = useUnlinkBankAccount();

  const [mo, setMo] = useState(false);
  const [form, setForm] = useState({ accountNumber: '', bankName: '', nickname: '' });

  const gui = (e: React.FormEvent) => {
    e.preventDefault();
    lienKet.mutate(
      { ...form, nickname: form.nickname || undefined },
      { onSuccess: () => { setMo(false); setForm({ accountNumber: '', bankName: '', nickname: '' }); } },
    );
  };

  return (
    <Card>
      <CardTitle
        action={
          <Button size="sm" variant="secondary" onClick={() => setMo(true)}>
            <Plus size={14} /> Liên kết
          </Button>
        }
      >
        <span className="flex items-center gap-2">
          <Landmark size={18} className="text-brand" /> Tài khoản ngân hàng
        </span>
      </CardTitle>

      {isLoading ? (
        <Skeleton className="h-24" />
      ) : isError ? (
        <ErrorState message={(error as ApiError).message} onRetry={() => void refetch()} />
      ) : !data?.length ? (
        <p className="muted text-sm">
          Chưa liên kết tài khoản nào. Giao dịch trong app đến từ ngân hàng qua SePay, nên
          phải liên kết ít nhất một tài khoản thì mới có dữ liệu.
        </p>
      ) : (
        <div className="space-y-3">
          {data.map((a) => {
            const imLang =
              !a.lastSyncedAt ||
              Date.now() - new Date(a.lastSyncedAt).getTime() > NGUONG_IM_LANG_GIO * 3600_000;

            return (
              <div key={a.id} className="rounded-xl bg-[var(--surface-2)] p-3">
                <div className="flex items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.nickname}</span>
                    <span className="muted block text-xs">
                      {a.bankName} · {a.accountNumber}
                    </span>
                  </span>
                  <span className="tabular shrink-0 font-semibold">
                    {formatMoney(a.currentBalance)}
                  </span>
                  <button
                    type="button"
                    onClick={() => goLienKet.mutate(a.id)}
                    className="muted shrink-0 p-1"
                    aria-label={`Gỡ liên kết ${a.nickname}`}
                  >
                    <Unlink size={14} />
                  </button>
                </div>

                {/*
                  Ngân hàng im lặng quá lâu KHÔNG hiện là nguy hiểm nhất: app trông vẫn bình
                  thường, số dư vẫn có, chỉ là đã cũ — user tưởng mình còn tiền.
                */}
                <p className={cn('mt-2 text-xs', imLang ? 'text-warning' : 'muted')}>
                  {imLang && <TriangleAlert size={12} className="mr-1 inline" />}
                  {a.lastSyncedAt
                    ? `Cập nhật lần cuối ${formatDate(a.lastSyncedAt)}`
                    : 'Chưa nhận được giao dịch nào từ SePay'}
                  {imLang && ' — kiểm tra lại webhook trên SePay'}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={mo} onClose={() => setMo(false)} title="Liên kết tài khoản ngân hàng">
        <form onSubmit={gui} className="space-y-4">
          <Field label="Số tài khoản">
            <Input
              value={form.accountNumber}
              onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
              placeholder="0123499999"
              required
            />
          </Field>
          {/*
            Phải khớp CHÍNH XÁC số SePay gửi trong `accountNumber`, nếu không webhook về mà
            không tra ra chủ — giao dịch bị bỏ qua và không ai biết vì sao app trống.
          */}
          <p className="muted -mt-2 text-xs">
            Nhập đúng số tài khoản đã cấu hình trên SePay. Sai một chữ số là giao dịch về
            không tìm được chủ.
          </p>

          <Field label="Ngân hàng">
            <Input
              value={form.bankName}
              onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
              placeholder="MBBank"
              required
            />
          </Field>

          <Field label="Tên gợi nhớ">
            <Input
              value={form.nickname}
              onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
              placeholder="Tài khoản chính"
            />
          </Field>

          <Button type="submit" loading={lienKet.isPending} className="w-full">
            Liên kết
          </Button>
        </form>
      </Modal>
    </Card>
  );
}
