'use client';

import { ArrowDownLeft, ArrowUpRight, HandCoins, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Button, EmptyState, ErrorState, Field, Input, MoneyInput, Modal, Select, Skeleton, cn,
} from '@/components/ui';
import { useCategories } from '@/hooks/useFinance';
import {
  useContactDetail, useCreateSettlement, useDeleteSharedExpense,
} from '@/hooks/useFriends';
import type { ApiError } from '@/lib/api/client';
import { formatDate, formatMoney, toDateInputValue } from '@/lib/format';

/** Câu mô tả công nợ — nói thẳng ai nợ ai, đừng bắt user đoán dấu âm dương */
function moTaCongNo(name: string, balance: number) {
  if (balance === 0) return { text: 'Đã sòng phẳng', lop: 'muted' };
  if (balance > 0) return { text: `${name} nợ bạn ${formatMoney(balance)}`, lop: 'text-income' };
  return { text: `Bạn nợ ${name} ${formatMoney(-balance)}`, lop: 'text-expense' };
}

export function ContactDetail({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const { data, isLoading, isError, error, refetch } = useContactDetail(contactId);
  const { data: danhMuc } = useCategories({ type: 'expense' });
  const tatToan = useCreateSettlement();
  const xoaBill = useDeleteSharedExpense();

  const [moTatToan, setMoTatToan] = useState(false);
  const [form, setForm] = useState({
    direction: 'they_paid_me',
    amount: '' as number | '',
    date: toDateInputValue(),
    categoryId: '',
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (isError) {
    return <ErrorState message={(error as ApiError).message} onRetry={() => void refetch()} />;
  }
  if (!data) return null;

  const { contact, history } = data;
  const mo = moTaCongNo(contact.name, contact.balance);
  const toiTraLai = form.direction === 'i_paid_them';

  const guiTatToan = (e: React.FormEvent) => {
    e.preventDefault();
    tatToan.mutate(
      {
        contactId,
        direction: form.direction,
        amount: Number(form.amount),
        date: new Date(form.date).toISOString(),
        categoryId: toiTraLai ? form.categoryId : null,
      },
      { onSuccess: () => setMoTatToan(false) },
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[var(--surface-2)] p-4 text-center">
        <p className={cn('text-lg font-semibold', mo.lop)}>{mo.text}</p>
      </div>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setMoTatToan(true)}>
          <HandCoins size={16} /> Ghi tất toán
        </Button>
        <Button variant="ghost" onClick={onClose}>Đóng</Button>
      </div>

      {!history.length ? (
        <EmptyState title="Chưa có phát sinh nào" description="Ghi một khoản chi chung để bắt đầu theo dõi." />
      ) : (
        <div className="space-y-2">
          {history.map((h) => (
            <div key={`${h.kind}-${h.id}`} className="flex items-start gap-3 rounded-xl bg-[var(--surface-2)] p-3">
              <span
                className={cn(
                  'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
                  h.effect > 0 ? 'bg-income/15 text-income' : 'bg-expense/15 text-expense',
                )}
              >
                {h.effect > 0 ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {h.kind === 'settlement'
                    ? h.direction === 'they_paid_me'
                      ? `${contact.name} trả lại bạn`
                      : `Bạn trả lại ${contact.name}`
                    : h.note || h.categoryName || 'Chi chung'}
                </p>
                <p className="muted text-xs">
                  {formatDate(h.date)}
                  {h.kind === 'shared_expense' && (
                    <>
                      {' · '}
                      {h.iPaid ? 'bạn ứng' : `${contact.name} ứng`} {formatMoney(h.totalAmount ?? 0)}
                    </>
                  )}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className={cn('tabular text-sm font-medium', h.effect > 0 ? 'text-income' : 'text-expense')}>
                  {h.effect > 0 ? '+' : ''}{formatMoney(h.effect)}
                </span>
                {h.kind === 'shared_expense' && (
                  <button
                    type="button"
                    onClick={() => xoaBill.mutate(h.id)}
                    className="muted p-1"
                    aria-label="Xóa khoản chi chung"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={moTatToan} onClose={() => setMoTatToan(false)} title="Ghi tất toán">
        <form onSubmit={guiTatToan} className="space-y-4">
          <div className="flex rounded-xl bg-[var(--surface-2)] p-1">
            {[
              { v: 'they_paid_me', nhan: `${contact.name} trả tôi` },
              { v: 'i_paid_them', nhan: `Tôi trả ${contact.name}` },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setForm((f) => ({ ...f, direction: o.v }))}
                className={cn(
                  'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition',
                  form.direction === o.v ? 'bg-brand text-white' : 'muted',
                )}
              >
                {o.nhan}
              </button>
            ))}
          </div>

          <Field label="Số tiền">
            <MoneyInput
              value={form.amount}
              onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
              required
            />
          </Field>

          <Field label="Ngày">
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </Field>

          {/*
            Chỉ chiều "tôi trả lại" mới cần danh mục: đó mới là lúc bạn THỰC SỰ tiêu tiền.
            Chiều ngược lại đi vào danh mục hệ thống nên không hỏi — hỏi cũng không dùng.
          */}
          {toiTraLai && (
            <Field label="Danh mục cho khoản chi này">
              <Select
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                required
              >
                <option value="">— Chọn —</option>
                {(danhMuc ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          )}

          <p className="muted text-xs">
            {toiTraLai
              ? 'Đây mới là lúc tiền rời ví bạn, nên khoản này sẽ vào thống kê chi tiêu.'
              : 'Tiền của bạn quay về nên số dư tăng, nhưng KHÔNG tính là thu nhập.'}
          </p>

          <Button type="submit" loading={tatToan.isPending} className="w-full">
            Lưu
          </Button>
        </form>
      </Modal>
    </div>
  );
}
