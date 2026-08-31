'use client';

import { Check, Plus, Split, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Button, Input, MoneyInput, Select, cn } from '@/components/ui';
import { useContacts, useCreateContact, useCreateSharedExpense } from '@/hooks/useFriends';
import { formatDate, formatMoney, toDateInputValue } from '@/lib/format';
import type { Contact, Transaction } from '@/types';

/**
 * Chia đều `tong` cho `soNguoi` người, **phần lẻ dồn vào NGƯỜI TRẢ**.
 *
 * Tiền là số nguyên đồng nên 1.000.000 ÷ 3 không chia hết. Người trả chịu vài đồng lẻ thay
 * vì bắt một người bạn trả 166.667₫ trong khi hai người kia trả 166.666₫.
 */
export function chiaDeu(tong: number, soNguoi: number): [number, number] {
  if (soNguoi <= 0) return [tong, 0];
  const moiNguoi = Math.floor(tong / soNguoi);
  return [tong - moiNguoi * (soNguoi - 1), moiNguoi];
}

/**
 * Avatar chữ cái đầu — cùng màu với danh bạ để nhận ra nhanh.
 *
 * Không có màu (phần của CHÍNH BẠN) thì rơi về `bg-brand`. Dùng lớp Tailwind chứ không
 * `var(--brand)`: token trong `globals.css` tên là `--color-brand`, viết sai tên biến thì
 * nền trong suốt mà không có lỗi nào báo.
 */
function Avatar({ ten, mau }: { ten: string; mau?: string }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
        !mau && 'bg-brand',
      )}
      style={mau ? { background: mau } : undefined}
    >
      {ten.trim().charAt(0).toUpperCase()}
    </span>
  );
}

interface Phan {
  /** `null` = phần của CHÍNH BẠN */
  contactId: string | null;
  name: string;
  color?: string;
  amount: number;
}

/**
 * Chia một hóa đơn cho bạn bè.
 *
 * - **Có `transaction`** — bạn đã trả bằng tài khoản ngân hàng. Form **TÁCH** giao dịch đó,
 *   không tạo mới: ngân hàng đã trừ tiền một lần rồi, tạo thêm là đếm hai lần.
 * - **Không có** — người khác trả hộ bạn. Tiền chưa rời tài khoản nên không giao dịch nào
 *   được tạo, chỉ ghi công nợ.
 */
export function SplitBillForm({
  transaction,
  onDone,
}: {
  transaction?: Transaction;
  onDone: () => void;
}) {
  const { data: danhBa } = useContacts();
  const taoNguoi = useCreateContact();
  const tao = useCreateSharedExpense();

  const toiTra = !!transaction;

  const [nguoiTra, setNguoiTra] = useState('');
  const [tong, setTong] = useState<number | ''>(transaction?.amount ?? '');
  const [ngay, setNgay] = useState(transaction ? transaction.date.slice(0, 10) : toDateInputValue());
  const [note, setNote] = useState('');
  const [tenMoi, setTenMoi] = useState('');

  const soTien = transaction?.amount ?? (Number(tong) || 0);

  const [phan, setPhan] = useState<Phan[]>([
    { contactId: null, name: 'Tôi', amount: 0 },
  ]);

  const daChia = phan.reduce((t, p) => t + p.amount, 0);
  const conLai = soTien - daChia;
  const khop = conLai === 0 && soTien > 0;

  const chiaDeuTatCa = (ds: Phan[] = phan, t: number = soTien) => {
    const [nguoiTraPhan, moiNguoi] = chiaDeu(t, ds.length);
    setPhan(ds.map((p) => ({ ...p, amount: p.contactId === null ? nguoiTraPhan : moiNguoi })));
  };

  /**
   * Sửa phần của một người → phần còn lại **tự cân lại** để tổng luôn bằng hóa đơn.
   *
   * - Sửa của người khác → phần của BẠN hứng chênh lệch. Bạn là người ứng tiền, nên phần
   *   nào họ không gánh thì mặc định bạn gánh — khỏi phải tự trừ nhẩm.
   * - Sửa phần của chính bạn → chia đều lại cho những người còn lại.
   *
   * Nhờ vậy tổng không bao giờ lệch, và thanh trạng thái gần như luôn xanh.
   */
  const suaPhan = (contactId: string | null, moi: number) => {
    setPhan((ds) => {
      if (contactId !== null) {
        const khac = ds.map((p) => (p.contactId === contactId ? { ...p, amount: moi } : p));
        const tongKhac = khac
          .filter((p) => p.contactId !== null)
          .reduce((t, p) => t + p.amount, 0);
        // Kẹp ở 0: phần âm là vô nghĩa, và BE cũng từ chối. Vượt quá thì thanh trạng thái
        // chuyển đỏ để bạn thấy ngay là đã chia quá tay.
        return khac.map((p) =>
          p.contactId === null ? { ...p, amount: Math.max(0, soTien - tongKhac) } : p,
        );
      }

      const nguoiKhac = ds.filter((p) => p.contactId !== null);
      if (!nguoiKhac.length) return ds.map((p) => ({ ...p, amount: moi }));

      const conLaiChoHo = Math.max(0, soTien - moi);
      const moiNguoi = Math.floor(conLaiChoHo / nguoiKhac.length);
      // Phần lẻ dồn vào người CUỐI để tổng khớp tuyệt đối
      const du = conLaiChoHo - moiNguoi * nguoiKhac.length;

      let i = 0;
      return ds.map((p) => {
        if (p.contactId === null) return { ...p, amount: moi };
        i += 1;
        return { ...p, amount: i === nguoiKhac.length ? moiNguoi + du : moiNguoi };
      });
    });
  };

  const toggle = (c: Contact) => {
    const daCo = phan.some((p) => p.contactId === c.id);
    const ds = daCo
      ? phan.filter((p) => p.contactId !== c.id)
      : [...phan, { contactId: c.id, name: c.name, color: c.color, amount: 0 }];
    chiaDeuTatCa(ds);
  };

  /** Gõ tên chưa có trong danh bạ → tạo tại chỗ, không bắt rời màn hình */
  const themTenMoi = () => {
    const ten = tenMoi.trim();
    if (!ten) return;
    const daCo = (danhBa ?? []).find((c) => c.name.trim().toLowerCase() === ten.toLowerCase());
    if (daCo) {
      if (!phan.some((p) => p.contactId === daCo.id)) toggle(daCo);
      setTenMoi('');
      return;
    }
    taoNguoi.mutate({ name: ten }, { onSuccess: (c) => { toggle(c); setTenMoi(''); } });
  };

  const gui = (e: React.FormEvent) => {
    e.preventDefault();
    tao.mutate(
      {
        payerContactId: toiTra ? null : nguoiTra || null,
        transactionId: transaction?.id ?? null,
        ...(toiTra ? {} : { totalAmount: soTien, date: new Date(ngay).toISOString() }),
        note: note || null,
        /*
         * Bỏ phần 0₫ — BE bắt buộc mọi phần phải DƯƠNG. Phần của bạn bằng 0 là trường hợp
         * thật: bạn trả hộ hoàn toàn mà không ăn miếng nào.
         */
        shares: phan
          .filter((p) => p.amount > 0)
          .map((p) => ({ contactId: p.contactId, amount: p.amount })),
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={gui} className="space-y-5">
      {/* ————— Hóa đơn ————— */}
      {toiTra ? (
        <div className="rounded-xl bg-[var(--surface-2)] px-4 py-3 text-center">
          <p className="tabular text-2xl font-bold">{formatMoney(soTien)}</p>
          <p className="muted mt-0.5 truncate text-xs">
            {formatDate(transaction!.date)}
            {transaction!.note ? ` · ${transaction!.note}` : ''}
          </p>
          {/*
            Giao dịch ngân hàng KHÔNG bị sửa gì — việc chia chỉ ghi vào sổ công nợ. Nói rõ
            để bạn không lo sổ ngân hàng bị app cắt gọt.
          */}
          <p className="muted mt-1.5 text-[11px]">
            Giao dịch giữ nguyên trong sổ ngân hàng · phần chia chỉ ghi vào công nợ
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="muted mb-1 block text-xs">Ai đã trả?</span>
            {/*
              "Tôi" phải là lựa chọn ĐẦU và mặc định: trả hộ cả nhóm bằng tiền mặt là lý do
              chính người ta mở form này. Trước đây chỉ liệt kê người trong danh bạ nên không
              có cách nào khai "tôi ứng tiền".
            */}
            <Select value={nguoiTra} onChange={(e) => setNguoiTra(e.target.value)}>
              <option value="">Tôi</option>
              {(danhBa ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="muted mb-1 block text-xs">Tổng hóa đơn</span>
            <MoneyInput
              value={tong}
              onChange={(v) => { setTong(v); chiaDeuTatCa(phan, Number(v) || 0); }}
              required
            />
          </label>
          <label className="col-span-2 block">
            <span className="muted mb-1 block text-xs">Ngày</span>
            <Input type="date" value={ngay} onChange={(e) => setNgay(e.target.value)} required />
          </label>
        </div>
      )}

      {/* ————— Bước 1: ai cùng chi ————— */}
      <div>
        <p className="mb-2 text-sm font-medium">Ai cùng chi khoản này?</p>

        {/*
          Bấm để bật/tắt từng người — một thao tác cho cả thêm lẫn bỏ. Trước đây thêm bằng
          chip còn bỏ bằng dấu ✕ ở dòng khác, hai chỗ cho cùng một việc.
        */}
        <div className="flex flex-wrap gap-2">
          {(danhBa ?? []).map((c) => {
            const chon = phan.some((p) => p.contactId === c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c)}
                className={cn(
                  'flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm transition',
                  chon ? 'bg-brand text-white' : 'bg-[var(--surface-2)]',
                )}
              >
                <Avatar ten={c.name} mau={chon ? 'rgba(255,255,255,.25)' : c.color} />
                {c.name}
                {chon && <Check size={14} />}
              </button>
            );
          })}

          {!danhBa?.length && (
            <p className="muted text-sm">Chưa có ai trong danh bạ — gõ tên bên dưới để thêm.</p>
          )}
        </div>

        <div className="mt-2 flex gap-2">
          <Input
            value={tenMoi}
            onChange={(e) => setTenMoi(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); themTenMoi(); }
            }}
            placeholder="Gõ tên người mới…"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={themTenMoi}
            loading={taoNguoi.isPending}
            aria-label="Thêm người"
          >
            <UserPlus size={16} />
          </Button>
        </div>
      </div>

      {/* ————— Bước 2: chia bao nhiêu ————— */}
      {phan.length > 1 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Mỗi người bao nhiêu?</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => chiaDeuTatCa()}>
              <Split size={14} /> Chia đều
            </Button>
          </div>

          <div className="space-y-1.5">
            {phan.map((p) => (
              <div key={p.contactId ?? 'toi'} className="flex items-center gap-2">
                <Avatar ten={p.name} mau={p.color} />
                <span className="w-20 shrink-0 truncate text-sm">{p.name}</span>
                <MoneyInput
                  value={p.amount}
                  onChange={(v) => suaPhan(p.contactId, Number(v) || 0)}
                  className="flex-1"
                />
              </div>
            ))}
          </div>

          {/*
            Thanh trạng thái: BE từ chối nếu tổng các phần lệch hóa đơn, nên phải thấy được
            ngay tại chỗ mà sửa, thay vì bấm Lưu rồi mới nhận lỗi.
          */}
          <p
            className={cn(
              'mt-2 rounded-lg px-3 py-2 text-sm',
              khop ? 'bg-ok/10 text-ok' : 'bg-exceeded/10 text-exceeded',
            )}
          >
            {khop
              ? 'Khớp đúng hóa đơn'
              : conLai > 0
                ? `Còn thiếu ${formatMoney(conLai)}`
                : `Thừa ${formatMoney(-conLai)}`}
          </p>
        </div>
      )}

      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ghi chú (VD: ăn tối sinh nhật)"
      />

      {!toiTra && (
        <p className="muted text-xs">
          {nguoiTra
            ? 'Người khác trả nên tiền chưa rời tài khoản bạn — chỉ ghi lại là bạn đang nợ họ.'
            : 'Bạn ứng tiền mặt — chỉ ghi công nợ, không tạo giao dịch nào.'}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="submit"
          loading={tao.isPending}
          disabled={!khop || phan.length < 2}
          className="flex-1"
        >
          <Plus size={16} /> Lưu
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Hủy
        </Button>
      </div>
    </form>
  );
}
