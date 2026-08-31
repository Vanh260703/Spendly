'use client';

import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Button, Field, Input, MoneyInput, Select } from '@/components/ui';
import { useContacts, useCreateContact, useCreateSharedExpense } from '@/hooks/useFriends';
import { toDateInputValue } from '@/lib/format';

/**
 * Ghi một khoản **BẠN NỢ người khác** — chỉ hỏi ba thứ: ai, bao nhiêu, vì gì.
 *
 * Vì sao tách khỏi form chia bill: chia bill bắt khai tổng hóa đơn rồi chia cho từng người.
 * Nhưng khi Tuấn trả 1 triệu cho bữa ăn 4 người và bạn nợ 250k, bạn **không theo dõi việc
 * Tuấn với hai người kia** — gõ cả hóa đơn là gõ một đống thông tin sẽ không bao giờ dùng.
 *
 * Dùng chung được cho cả trường hợp **mượn tiền thẳng** ("Tuấn cho mượn 500k"), vốn không
 * có hóa đơn nào để chia.
 *
 * ⚠️ Không cần model mới: ghi thành `SharedExpense` với `payerContactId` = người đó,
 * `totalAmount` = số bạn nợ, và **một share duy nhất là của bạn**. Đúng ngữ nghĩa "họ trả
 * ngần này, toàn bộ là phần tôi", nên công thức công nợ chạy y nguyên.
 */
export function OweForm({ onDone }: { onDone: () => void }) {
  const { data: danhBa } = useContacts();
  const taoNguoi = useCreateContact();
  const tao = useCreateSharedExpense();

  const [contactId, setContactId] = useState('');
  const [soTien, setSoTien] = useState<number | ''>('');
  const [ngay, setNgay] = useState(toDateInputValue());
  const [note, setNote] = useState('');
  const [tenMoi, setTenMoi] = useState('');

  /** Gõ tên chưa có trong danh bạ → tạo tại chỗ, không bắt rời màn hình */
  const themTenMoi = () => {
    const ten = tenMoi.trim();
    if (!ten) return;
    const daCo = (danhBa ?? []).find((c) => c.name.trim().toLowerCase() === ten.toLowerCase());
    if (daCo) {
      setContactId(daCo.id);
      setTenMoi('');
      return;
    }
    taoNguoi.mutate({ name: ten }, {
      onSuccess: (c) => { setContactId(c.id); setTenMoi(''); },
    });
  };

  const gui = (e: React.FormEvent) => {
    e.preventDefault();
    tao.mutate(
      {
        payerContactId: contactId,
        totalAmount: Number(soTien),
        date: new Date(ngay).toISOString(),
        note: note || null,
        // Một share duy nhất — toàn bộ khoản này là phần của bạn
        shares: [{ contactId: null, amount: Number(soTien) }],
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={gui} className="space-y-4">
      <Field label="Bạn nợ ai?">
        <Select value={contactId} onChange={(e) => setContactId(e.target.value)} required>
          <option value="">— Chọn người —</option>
          {(danhBa ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Field>

      <div className="flex gap-2">
        <Input
          value={tenMoi}
          onChange={(e) => setTenMoi(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); themTenMoi(); }
          }}
          placeholder="Hoặc gõ tên người mới…"
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

      <div className="grid grid-cols-2 gap-3">
        <Field label="Số tiền bạn nợ">
          <MoneyInput value={soTien} onChange={setSoTien} required autoFocus />
        </Field>
        <Field label="Ngày">
          <Input type="date" value={ngay} onChange={(e) => setNgay(e.target.value)} required />
        </Field>
      </div>

      <Field label="Vì gì?">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Tuấn trả bữa tối · mượn tiền mặt…"
        />
      </Field>

      <p className="muted text-xs">
        Chỉ ghi công nợ, không tạo giao dịch — tiền chưa rời tài khoản bạn. Khoản chi chỉ
        xuất hiện khi bạn trả lại họ.
      </p>

      <div className="flex gap-2">
        <Button type="submit" loading={tao.isPending} disabled={!contactId || !soTien} className="flex-1">
          Lưu
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>Hủy</Button>
      </div>
    </form>
  );
}
