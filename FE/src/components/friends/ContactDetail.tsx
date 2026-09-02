'use client';

import { HandCoins, QrCode, Receipt, Trash2 } from 'lucide-react';
import { QrUpload } from '@/components/friends/QrUpload';
import { useState } from 'react';
import {
  Button, EmptyState, ErrorState, Field, Input, MoneyInput, Modal, Skeleton, cn,
} from '@/components/ui';
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
  const tatToan = useCreateSettlement();
  const xoaBill = useDeleteSharedExpense();

  const [tab, setTab] = useState<'congno' | 'qr'>('congno');
  const [moTraNo, setMoTraNo] = useState(false);
  const [soTien, setSoTien] = useState<number | ''>('');
  const [ngay, setNgay] = useState(toDateInputValue());

  if (isLoading) return <Skeleton className="h-64" />;
  if (isError) {
    return <ErrorState message={(error as ApiError).message} onRetry={() => void refetch()} />;
  }
  if (!data) return null;

  const { contact, history } = data;
  const mo = moTaCongNo(contact.name, contact.balance);

  /*
   * Chiều trả nợ SUY RA TỪ SỐ DƯ, không bắt người dùng chọn.
   *
   * Họ nợ mình thì chỉ có thể là "họ đã trả"; mình nợ họ thì chỉ có thể là "mình thanh
   * toán". Cho chọn cả hai chiều là mở đường chọn nhầm, mà chọn nhầm thì công nợ chạy
   * ngược và rất khó nhận ra.
   */
  const hoNoToi = contact.balance > 0;
  const conNo = Math.abs(contact.balance);

  const guiTraNo = (e: React.FormEvent) => {
    e.preventDefault();
    tatToan.mutate(
      {
        contactId,
        direction: hoNoToi ? 'they_paid_me' : 'i_paid_them',
        amount: Number(soTien),
        date: new Date(ngay).toISOString(),
      },
      { onSuccess: () => { setMoTraNo(false); setSoTien(''); } },
    );
  };

  const moFormTraNo = () => {
    setSoTien(conNo); // mặc định trả đủ — trường hợp thường gặp nhất
    setMoTraNo(true);
  };

  return (
    <div className="space-y-4">
      {/*
        Hai việc rất khác nhau với cùng một người: xem nợ bao nhiêu, và quét QR để chuyển
        tiền. Gộp một màn hình thì lúc cần quét phải cuộn qua bảng lịch sử, mà quét QR là
        việc làm vội — đang mở app ở quán, tay kia cầm điện thoại người ta.
      */}
      <div className="flex rounded-xl bg-[var(--surface-2)] p-1">
        {[
          { key: 'congno' as const, nhan: 'Công nợ', Icon: Receipt },
          { key: 'qr' as const, nhan: 'Mã QR', Icon: QrCode },
        ].map(({ key, nhan, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition',
              tab === key ? 'bg-brand text-white' : 'muted',
            )}
          >
            <Icon size={15} /> {nhan}
          </button>
        ))}
      </div>

      {tab === 'qr' ? (
        <>
          <QrUpload contactId={contactId} qrImage={contact.qrImage} ten={contact.name} />
          <Button variant="ghost" className="w-full" onClick={onClose}>Đóng</Button>
        </>
      ) : (
        <>
      <div className="rounded-xl bg-[var(--surface-2)] p-4 text-center">
        <p className={cn('text-lg font-semibold', mo.lop)}>{mo.text}</p>
      </div>

      <div className="flex gap-2">
        {/* Sòng phẳng rồi thì không có gì để trả — ẩn nút thay vì để nó mở ra form vô nghĩa */}
        {contact.balance !== 0 && (
          <Button className="flex-1" onClick={moFormTraNo}>
            <HandCoins size={16} />
            {hoNoToi ? 'Đã trả' : 'Thanh toán'}
          </Button>
        )}
        <Button variant="ghost" className={contact.balance === 0 ? 'flex-1' : ''} onClick={onClose}>
          Đóng
        </Button>
      </div>

      {!history.length ? (
        <EmptyState
          title="Chưa có phát sinh nào"
          description="Chia một khoản chi cho người này để bắt đầu theo dõi."
        />
      ) : (
        /*
         * Bảng, không phải danh sách thẻ — cùng kiểu với sổ giao dịch. Ba cột đủ trả lời
         * "khoản nào, bao nhiêu, đẩy công nợ đi hướng nào".
         */
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="muted border-b text-left text-xs">
                <th className="px-2 py-2 font-medium whitespace-nowrap">Ngày</th>
                <th className="px-2 py-2 font-medium">Nội dung</th>
                <th className="px-2 py-2 text-right font-medium whitespace-nowrap">
                  Công nợ
                </th>
                <th className="w-8 px-1 py-2" />
              </tr>
            </thead>

            <tbody className="divide-y">
              {history.map((h) => (
                <tr key={`${h.kind}-${h.id}`} className="group">
                  <td className="muted tabular px-2 py-2 whitespace-nowrap">
                    {formatDate(h.date)}
                  </td>

                  <td className="max-w-0 px-2 py-2">
                    <span className="block truncate">
                      {h.kind === 'settlement'
                        ? h.direction === 'they_paid_me'
                          ? `${contact.name} trả lại bạn`
                          : `Bạn trả lại ${contact.name}`
                        : h.note || 'Chi chung'}
                    </span>
                    {h.kind === 'shared_expense' && (
                      <span className="muted text-xs">
                        Hóa đơn {formatMoney(h.totalAmount ?? 0)} ·{' '}
                        {h.iPaid ? 'bạn ứng' : `${contact.name} ứng`}
                      </span>
                    )}
                  </td>

                  {/* Dương = họ nợ thêm · âm = công nợ giảm đi */}
                  <td
                    className={cn(
                      'tabular px-2 py-2 text-right font-medium whitespace-nowrap',
                      h.effect > 0 ? 'text-income' : 'text-expense',
                    )}
                  >
                    {h.effect > 0 ? '+' : '−'}
                    {formatMoney(Math.abs(h.effect))}
                  </td>

                  <td className="px-1 py-1">
                    {h.kind === 'shared_expense' && (
                      <button
                        type="button"
                        onClick={() => xoaBill.mutate(h.id)}
                        className="muted p-1 opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                        aria-label="Xóa khoản chi chung"
                        title="Xóa khoản chi chung"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

        </>
      )}

      <Modal
        open={moTraNo}
        onClose={() => setMoTraNo(false)}
        title={hoNoToi ? `${contact.name} đã trả` : `Thanh toán cho ${contact.name}`}
      >
        <form onSubmit={guiTraNo} className="space-y-4">
          <div className="rounded-xl bg-[var(--surface-2)] px-4 py-3 text-center">
            <p className="muted text-xs">{hoNoToi ? 'Đang nợ bạn' : 'Bạn đang nợ'}</p>
            <p className="tabular text-2xl font-bold">{formatMoney(conNo)}</p>
          </div>

          {/*
            Hai trường hợp bạn nêu: trả đủ, hoặc trả một phần. Trả đủ là trường hợp thường
            gặp nhất nên đặt sẵn số tiền — mở form ra bấm Lưu là xong, không phải gõ gì.
          */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={soTien === conNo ? 'primary' : 'secondary'}
              className="flex-1"
              onClick={() => setSoTien(conNo)}
            >
              Trả đủ {formatMoney(conNo)}
            </Button>
            <Button
              type="button"
              variant={soTien !== conNo ? 'primary' : 'secondary'}
              className="flex-1"
              onClick={() => setSoTien('')}
            >
              Trả một phần
            </Button>
          </div>

          <Field label="Số tiền">
            <MoneyInput value={soTien} onChange={setSoTien} required autoFocus />
          </Field>

          <Field label="Ngày">
            <Input type="date" value={ngay} onChange={(e) => setNgay(e.target.value)} required />
          </Field>

          {/*
            Trả DƯ được phép — công nợ đổi dấu. Nhưng phải nói trước, nếu không người dùng
            gõ nhầm một số 0 rồi tưởng app tính sai.
          */}
          {Number(soTien) > conNo && (
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
              Nhiều hơn số đang nợ {formatMoney(Number(soTien) - conNo)} —{' '}
              {hoNoToi ? `bạn sẽ nợ lại ${contact.name}` : `${contact.name} sẽ nợ lại bạn`}.
            </p>
          )}

          <p className="muted text-xs">
            Chỉ ghi công nợ, không tạo giao dịch — tiền chuyển khoản đã có ngân hàng báo về.
          </p>

          <Button type="submit" loading={tatToan.isPending} className="w-full">
            Lưu
          </Button>
        </form>
      </Modal>
    </div>
  );
}
