'use client';

import { Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Button, Field, Input, MoneyInput, Select, cn,
} from '@/components/ui';
import { useCategories } from '@/hooks/useFinance';
import { useContacts, useCreateContact, useCreateSharedExpense } from '@/hooks/useFriends';
import { formatMoney, toDateInputValue } from '@/lib/format';
import type { Contact } from '@/types';

/**
 * Chia đều một số tiền cho `soNguoi` người, **phần lẻ dồn vào NGƯỜI TRẢ**.
 *
 * Tiền là số nguyên đồng nên 1.000.000 ÷ 3 không chia hết. Người trả chịu vài đồng lẻ thay
 * vì bắt một người bạn trả 166.667₫ trong khi hai người kia trả 166.666₫.
 *
 * Trả về `[phầnNgườiTrả, phầnMỗiNgườiKhác]` — bất biến `phầnNgườiTrả + (n−1)×phầnKia = tổng`
 * luôn giữ, và đó là điều kiện BE bắt buộc kiểm.
 */
export function chiaDeu(tong: number, soNguoi: number): [number, number] {
  if (soNguoi <= 0) return [tong, 0];
  const moiNguoi = Math.floor(tong / soNguoi);
  const nguoiTra = tong - moiNguoi * (soNguoi - 1);
  return [nguoiTra, moiNguoi];
}

interface DongChia {
  /** `null` = phần của CHÍNH BẠN */
  contactId: string | null;
  name: string;
  amount: number;
}

export function SplitBillForm({ onDone }: { onDone: () => void }) {
  const { data: danhBa } = useContacts();
  const { data: danhMuc } = useCategories({ type: 'expense' });
  const taoNguoi = useCreateContact();
  const tao = useCreateSharedExpense();

  const [toiTra, setToiTra] = useState(true);
  const [nguoiTra, setNguoiTra] = useState<string>('');
  const [tong, setTong] = useState<number | ''>('');
  const [ngay, setNgay] = useState(toDateInputValue());
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [coMoi, setCoMoi] = useState(false);
  const [treatAmount, setTreatAmount] = useState<number | ''>('');
  const [treatCategoryId, setTreatCategoryId] = useState('');

  const [dong, setDong] = useState<DongChia[]>([{ contactId: null, name: 'Tôi', amount: 0 }]);
  const [tenMoi, setTenMoi] = useState('');
  const [tuChia, setTuChia] = useState(true);

  const tongCacPhan = dong.reduce((t, d) => t + d.amount, 0);
  const lech = (Number(tong) || 0) - tongCacPhan;
  const phanCuaToi = dong.find((d) => d.contactId === null)?.amount ?? 0;

  const danhMucChon = useMemo(
    () => (danhMuc ?? []).filter((c) => c.type === 'expense'),
    [danhMuc],
  );

  /** Chia đều lại toàn bộ khi đổi tổng tiền hoặc thêm/bớt người */
  const chiaLai = (soTien: number, ds: DongChia[]) => {
    const [nguoiTraPhan, moiNguoi] = chiaDeu(soTien, ds.length);
    // Phần lẻ về người TRẢ: là bạn khi bạn ứng tiền, còn không thì vẫn để về bạn
    // (bạn là người ghi sổ, chịu vài đồng lẻ dễ hơn đi đòi một con số lẻ)
    return ds.map((d) => ({
      ...d,
      amount: d.contactId === null ? nguoiTraPhan : moiNguoi,
    }));
  };

  const doiTong = (v: number | '') => {
    setTong(v);
    if (tuChia) setDong((ds) => chiaLai(Number(v) || 0, ds));
  };

  const themNguoi = (c: Contact) => {
    if (dong.some((d) => d.contactId === c.id)) return;
    const ds = [...dong, { contactId: c.id, name: c.name, amount: 0 }];
    setDong(tuChia ? chiaLai(Number(tong) || 0, ds) : ds);
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
      onSuccess: (c) => {
        themNguoi(c);
        setTenMoi('');
      },
    });
  };

  const boNguoi = (contactId: string) => {
    const ds = dong.filter((d) => d.contactId !== contactId);
    setDong(tuChia ? chiaLai(Number(tong) || 0, ds) : ds);
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
        totalAmount: Number(tong),
        date: new Date(ngay).toISOString(),
        note: note || null,
        categoryId,
        treatAmount: toiTra && coMoi ? Number(treatAmount) || 0 : 0,
        treatCategoryId: toiTra && coMoi ? treatCategoryId : null,
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
      {/* Ai trả — quyết định có sinh giao dịch hay không, nên đặt lên đầu */}
      <div className="flex rounded-xl bg-[var(--surface-2)] p-1">
        {[
          { v: true, nhan: 'Tôi trả' },
          { v: false, nhan: 'Người khác trả' },
        ].map((o) => (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => setToiTra(o.v)}
            className={cn(
              'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition',
              toiTra === o.v ? 'bg-brand text-white' : 'muted',
            )}
          >
            {o.nhan}
          </button>
        ))}
      </div>

      {!toiTra && (
        <Field label="Ai đã trả?">
          <Select value={nguoiTra} onChange={(e) => setNguoiTra(e.target.value)} required>
            <option value="">— Chọn người —</option>
            {(danhBa ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Tổng hóa đơn">
        <MoneyInput value={tong} onChange={doiTong} required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Ngày">
          <Input type="date" value={ngay} onChange={(e) => setNgay(e.target.value)} required />
        </Field>
        <Field label="Danh mục">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
            <option value="">— Chọn —</option>
            {danhMucChon.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Ghi chú">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ăn tối sinh nhật..." />
      </Field>

      {/* ————— Chia phần ————— */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Chia cho ai</span>
          {!tuChia && (
            <button
              type="button"
              className="text-xs text-brand"
              onClick={() => {
                setTuChia(true);
                setDong((ds) => chiaLai(Number(tong) || 0, ds));
              }}
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
          Combobox: chọn từ danh bạ HOẶC gõ tên mới tạo tại chỗ.
          Bắt user vào Danh bạ tạo người trước rồi mới ghi được bữa ăn thì lần đầu dùng —
          danh bạ trống — họ sẽ kẹt cứng ở đây.
        */}
        <div className="flex gap-2">
          <Input
            value={tenMoi}
            onChange={(e) => setTenMoi(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                themTenMoi();
              }
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
          Bất biến `Σ phần = tổng hóa đơn` — BE từ chối nếu lệch. Hiện ngay tại chỗ để user
          sửa được, thay vì bấm Lưu rồi mới nhận lỗi.
        */}
        {lech !== 0 && Number(tong) > 0 && (
          <p className="text-sm text-exceeded">
            {lech > 0 ? 'Còn thiếu' : 'Thừa'} {formatMoney(Math.abs(lech))} so với hóa đơn
          </p>
        )}
      </div>

      {/* ————— Phần mời (chỉ khi bạn trả) ————— */}
      {toiTra && (
        <div className="rounded-xl bg-[var(--surface-2)] p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={coMoi}
              onChange={(e) => setCoMoi(e.target.checked)}
              className="size-4"
            />
            Trong phần của tôi có tiền mời
          </label>

          {coMoi && (
            <div className="mt-3 space-y-3">
              <p className="muted text-xs">
                Tách riêng để AI phân biệt được &ldquo;ăn nhiều&rdquo; với &ldquo;mời nhiều&rdquo;
                — hai chuyện khác nhau, hai lời khuyên khác nhau.
              </p>
              <Field label={`Số tiền mời (phần của tôi: ${formatMoney(phanCuaToi)})`}>
                <MoneyInput value={treatAmount} onChange={setTreatAmount} />
              </Field>
              <Field label="Danh mục cho phần mời">
                <Select
                  value={treatCategoryId}
                  onChange={(e) => setTreatCategoryId(e.target.value)}
                  required
                >
                  <option value="">— Chọn —</option>
                  {danhMucChon.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
        </div>
      )}

      {!toiTra && (
        <p className="muted text-xs">
          Người khác trả nên tiền chưa rời ví bạn — sẽ không có giao dịch nào được tạo, chỉ
          ghi lại là bạn đang nợ họ. Khoản chi chỉ xuất hiện khi bạn trả lại.
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" loading={tao.isPending} className="flex-1">
          Lưu
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Hủy
        </Button>
      </div>
    </form>
  );
}
