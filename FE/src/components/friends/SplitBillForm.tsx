'use client';

import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button, Field, Input, MoneyInput, Select, cn } from '@/components/ui';
import { useContacts, useCreateContact, useCreateSharedExpense } from '@/hooks/useFriends';
import { formatDate, formatMoney, toDateInputValue } from '@/lib/format';
import type { Contact, Transaction } from '@/types';

/**
 * Chia đều một số tiền cho `soNguoi` người, **phần lẻ dồn vào NGƯỜI TRẢ**.
 *
 * Tiền là số nguyên đồng nên 1.000.000 ÷ 3 không chia hết. Người trả chịu vài đồng lẻ thay
 * vì bắt một người bạn trả 166.667₫ trong khi hai người kia trả 166.666₫.
 */
export function chiaDeu(tong: number, soNguoi: number): [number, number] {
  if (soNguoi <= 0) return [tong, 0];
  const moiNguoi = Math.floor(tong / soNguoi);
  return [tong - moiNguoi * (soNguoi - 1), moiNguoi];
}

interface DongChia {
  /** `null` = phần của CHÍNH BẠN */
  contactId: string | null;
  name: string;
  amount: number;
}

/**
 * Chia một hóa đơn cho bạn bè.
 *
 * Hai chế độ, quyết định bởi việc có truyền `transaction` vào hay không:
 *
 * - **Có `transaction`** — bạn đã trả bằng tài khoản ngân hàng và giao dịch đã về app.
 *   Form **TÁCH** giao dịch đó, không tạo giao dịch mới: ngân hàng đã trừ tiền một lần rồi,
 *   tạo thêm là đếm hai lần và số dư app sẽ thấp hơn thực tế đúng một hóa đơn.
 *   Tổng tiền và ngày lấy từ giao dịch, không cho sửa.
 *
 * - **Không có** — người khác trả hộ bạn. Tiền chưa rời tài khoản nên **không giao dịch nào**
 *   được tạo; phải khai tổng tiền và ngày bằng tay.
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
  const [ngay, setNgay] = useState(
    transaction ? transaction.date.slice(0, 10) : toDateInputValue(),
  );
  const [note, setNote] = useState(transaction?.note ?? '');
  const [tenMoi, setTenMoi] = useState('');
  const [tuChia, setTuChia] = useState(true);

  const soTien = transaction?.amount ?? (Number(tong) || 0);
  const [khoiTaoNguoiTra] = chiaDeu(soTien, 1);
  const [dong, setDong] = useState<DongChia[]>([
    { contactId: null, name: 'Tôi', amount: khoiTaoNguoiTra },
  ]);

  const tongCacPhan = dong.reduce((t, d) => t + d.amount, 0);
  const lech = soTien - tongCacPhan;
  const phanCuaToi = dong.find((d) => d.contactId === null)?.amount ?? 0;

  const chiaLai = (t: number, ds: DongChia[]) => {
    const [phanNguoiTra, moiNguoi] = chiaDeu(t, ds.length);
    return ds.map((d) => ({
      ...d,
      amount: d.contactId === null ? phanNguoiTra : moiNguoi,
    }));
  };

  const doiTong = (v: number | '') => {
    setTong(v);
    if (tuChia) setDong((ds) => chiaLai(Number(v) || 0, ds));
  };

  const themNguoi = (c: Contact) => {
    if (dong.some((d) => d.contactId === c.id)) return;
    const ds = [...dong, { contactId: c.id, name: c.name, amount: 0 }];
    setDong(tuChia ? chiaLai(soTien, ds) : ds);
  };

  /** Gõ tên chưa có trong danh bạ → tạo tại chỗ, không bắt rời màn hình */
  const themTenMoi = () => {
    const ten = tenMoi.trim();
    if (!ten) return;
    const daCo = (danhBa ?? []).find(
      (c) => c.name.trim().toLowerCase() === ten.toLowerCase(),
    );
    if (daCo) {
      themNguoi(daCo);
      setTenMoi('');
      return;
    }
    taoNguoi.mutate({ name: ten }, {
      onSuccess: (c) => { themNguoi(c); setTenMoi(''); },
    });
  };

  const boNguoi = (contactId: string) => {
    const ds = dong.filter((d) => d.contactId !== contactId);
    setDong(tuChia ? chiaLai(soTien, ds) : ds);
  };

  const suaPhan = (contactId: string | null, amount: number) => {
    setTuChia(false); // đã sửa tay thì đừng tự chia đè lên nữa
    setDong((ds) => ds.map((d) => (d.contactId === contactId ? { ...d, amount } : d)));
  };

  const gui = (e: React.FormEvent) => {
    e.preventDefault();
    tao.mutate(
      {
        payerContactId: toiTra ? null : nguoiTra,
        transactionId: transaction?.id ?? null,
        // Khi tách giao dịch ngân hàng thì BE lấy số tiền và ngày từ chính giao dịch đó
        ...(toiTra ? {} : { totalAmount: Number(tong), date: new Date(ngay).toISOString() }),
        note: note || null,
        shares: dong.map((d) => ({ contactId: d.contactId, amount: d.amount })),
      },
      { onSuccess: onDone },
    );
  };

  const goiYThem = (danhBa ?? []).filter(
    (c) => !dong.some((d) => d.contactId === c.id) && c.id !== nguoiTra,
  );

  return (
    <form onSubmit={gui} className="space-y-4">
      {toiTra ? (
        <div className="rounded-xl bg-[var(--surface-2)] p-3">
          <p className="muted text-xs">Tách giao dịch ngân hàng</p>
          <p className="tabular text-lg font-semibold">{formatMoney(soTien)}</p>
          <p className="muted text-xs">
            {formatDate(transaction!.date)}
            {transaction!.note ? ` · ${transaction!.note}` : ''}
          </p>
          {/*
            Nói rõ vì sao không cho sửa số tiền: ngân hàng đã trừ đúng ngần này, các phần
            chia ra chỉ là cách ghi nhận ai chịu bao nhiêu TRONG số đó.
          */}
          <p className="muted mt-1.5 text-xs">
            Số tiền lấy từ ngân hàng nên không sửa được. Các phần bên dưới phải cộng lại
            đúng bằng con số này.
          </p>
        </div>
      ) : (
        <>
          <Field label="Ai đã trả?">
            <Select value={nguoiTra} onChange={(e) => setNguoiTra(e.target.value)} required>
              <option value="">— Chọn người —</option>
              {(danhBa ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tổng hóa đơn">
              <MoneyInput value={tong} onChange={doiTong} required />
            </Field>
            <Field label="Ngày">
              <Input type="date" value={ngay} onChange={(e) => setNgay(e.target.value)} required />
            </Field>
          </div>
        </>
      )}

      <Field label="Ghi chú">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ăn tối..." />
      </Field>

      {/* ————— Chia phần ————— */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Chia cho ai</span>
          {!tuChia && (
            <button
              type="button"
              className="text-xs text-brand"
              onClick={() => { setTuChia(true); setDong((ds) => chiaLai(soTien, ds)); }}
            >
              Chia đều lại
            </button>
          )}
        </div>

        {dong.map((d) => (
          <div key={d.contactId ?? 'toi'} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-sm">{d.name}</span>
            <MoneyInput
              value={d.amount}
              onChange={(v) => suaPhan(d.contactId, Number(v) || 0)}
              className="flex-1"
            />
            {d.contactId && (
              <button
                type="button"
                onClick={() => boNguoi(d.contactId!)}
                className="muted shrink-0 p-1"
                aria-label={`Bỏ ${d.name}`}
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}

        {/*
          Combobox: chọn từ danh bạ HOẶC gõ tên mới tạo tại chỗ. Bắt vào Danh bạ tạo người
          trước rồi mới ghi được bữa ăn thì lần đầu dùng — danh bạ trống — sẽ kẹt cứng.
        */}
        <div className="flex gap-2">
          <Input
            value={tenMoi}
            onChange={(e) => setTenMoi(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); themTenMoi(); }
            }}
            placeholder="Gõ tên để thêm người..."
          />
          <Button type="button" variant="secondary" onClick={themTenMoi} loading={taoNguoi.isPending}>
            <Plus size={16} />
          </Button>
        </div>

        {goiYThem.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {goiYThem.slice(0, 8).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => themNguoi(c)}
                className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs transition hover:opacity-80"
              >
                + {c.name}
              </button>
            ))}
          </div>
        )}

        {/*
          Bất biến `Σ phần = hóa đơn` — BE từ chối nếu lệch. Hiện ngay tại chỗ để sửa được,
          thay vì bấm Lưu rồi mới nhận lỗi.
        */}
        {lech !== 0 && soTien > 0 && (
          <p className={cn('text-sm', 'text-exceeded')}>
            {lech > 0 ? 'Còn thiếu' : 'Thừa'} {formatMoney(Math.abs(lech))} so với hóa đơn
          </p>
        )}
      </div>

      {!toiTra && (
        <p className="muted text-xs">
          Người khác trả nên tiền chưa rời tài khoản bạn — sẽ không có giao dịch nào được
          tạo, chỉ ghi lại là bạn đang nợ họ. Khoản chi chỉ xuất hiện khi bạn trả lại.
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" loading={tao.isPending} className="flex-1">Lưu</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Hủy</Button>
      </div>
    </form>
  );
}
