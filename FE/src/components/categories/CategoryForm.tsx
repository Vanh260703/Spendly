'use client';

import { useEffect, useState } from 'react';
import {
  Button, CATEGORY_ICONS, CategoryIcon, Field, Input, Select, cn,
  type CategoryIconName,
} from '@/components/ui';
import { useCreateCategory } from '@/hooks/useFinance';
import { useUpdateCategory } from '@/hooks/useSettings';
import type { Category, CategoryKind, TxType } from '@/types';

/** Bảng màu chọn sẵn — user không phải gõ mã hex, và màu luôn hợp với giao diện */
const MAU = [
  '#f97316', '#3b82f6', '#8b5cf6', '#14b8a6', '#ef4444', '#6366f1',
  '#a16207', '#ec4899', '#a855f7', '#0891b2', '#22c55e', '#64748b',
];

/** Lấy thẳng từ bảng icon dùng chung — thêm icon mới ở đó là picker tự có */
const ICON = Object.keys(CATEGORY_ICONS) as CategoryIconName[];

const KIND_MO_TA: Record<CategoryKind, string> = {
  need: 'Thiết yếu, không cắt được: tiền nhà, điện nước, đi làm, thuốc men',
  want: 'Có thể cắt: cà phê, xem phim, mua sắm ngoài kế hoạch',
  saving: 'Để dành hoặc trả nợ',
};

export function CategoryForm({
  editing,
  defaultType = 'expense',
  onDone,
}: {
  editing?: Category | null;
  defaultType?: TxType;
  onDone: () => void;
}) {
  const tao = useCreateCategory();
  const sua = useUpdateCategory();

  const [form, setForm] = useState({
    name: '',
    type: defaultType as TxType,
    kind: 'need' as CategoryKind,
    icon: 'circle-ellipsis',
    color: MAU[0],
  });

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        type: editing.type,
        kind: editing.kind,
        icon: editing.icon,
        color: editing.color,
      });
    }
  }, [editing]);

  const gui = (e: React.FormEvent) => {
    e.preventDefault();

    if (editing) {
      // BE không cho đổi `type`: đổi chi↔thu sẽ làm mọi giao dịch cũ lệch chiều tiền
      const { type: _bo, ...coTheSua } = form;
      sua.mutate({ id: editing.id, ...coTheSua }, { onSuccess: onDone });
    } else {
      tao.mutate(form, { onSuccess: onDone });
    }
  };

  return (
    <form onSubmit={gui} className="space-y-4">
      <Field label="Tên danh mục">
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Trà sữa"
          required
          autoFocus
        />
      </Field>

      {editing ? (
        <p className="muted text-sm">
          Loại: <strong>{form.type === 'expense' ? 'Khoản chi' : 'Khoản thu'}</strong> — không đổi
          được, vì mọi giao dịch cũ sẽ bị lệch chiều tiền. Muốn đổi thì tạo danh mục mới.
        </p>
      ) : (
        <Field label="Loại">
          <Select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as TxType })}
          >
            <option value="expense">Khoản chi</option>
            <option value="income">Khoản thu</option>
          </Select>
        </Field>
      )}

      {form.type === 'expense' && (
        <Field
          label="Phân loại"
          hint="Quyết định AI có được phép đề xuất cắt giảm danh mục này hay không"
        >
          <div className="space-y-1.5">
            {(['need', 'want', 'saving'] as const).map((k) => (
              <label
                key={k}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition',
                  form.kind === k ? 'border-brand bg-brand/5' : 'hover:bg-[var(--surface-2)]',
                )}
              >
                <input
                  type="radio"
                  checked={form.kind === k}
                  onChange={() => setForm({ ...form, kind: k })}
                  className="mt-0.5 size-4 accent-[var(--color-brand)]"
                />
                <span>
                  <span className="text-sm font-medium">
                    {{ need: 'Cần thiết', want: 'Mong muốn', saving: 'Tiết kiệm' }[k]}
                  </span>
                  <span className="muted block text-xs">{KIND_MO_TA[k]}</span>
                </span>
              </label>
            ))}
          </div>
        </Field>
      )}

      <Field label="Màu">
        <div className="flex flex-wrap gap-2">
          {MAU.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setForm({ ...form, color: m })}
              style={{ background: m }}
              className={cn(
                'size-8 rounded-full transition',
                form.color === m && 'ring-2 ring-offset-2 ring-offset-[var(--surface)]',
              )}
              aria-label={`Chọn màu ${m}`}
            />
          ))}
        </div>
      </Field>

      <Field label="Icon">
        {/*
          Lưới icon THẬT thay vì dropdown tên: "gamepad-2" hay "heart-pulse" đọc lên
          không hình dung được gì, phải chọn rồi lưu mới biết nó ra sao.
          Tô sẵn màu đang chọn để thấy trước kết quả cuối cùng.
        */}
        <div className="grid max-h-44 grid-cols-8 gap-1.5 overflow-y-auto rounded-xl bg-[var(--surface-2)] p-2">
          {ICON.map((i) => {
            const Icon = CATEGORY_ICONS[i];
            const chon = form.icon === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setForm({ ...form, icon: i })}
                title={i}
                aria-label={i}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-lg transition',
                  chon ? 'text-white' : 'muted hover:bg-[var(--surface)]',
                )}
                style={chon ? { background: form.color } : undefined}
              >
                <Icon size={17} />
              </button>
            );
          })}
        </div>
      </Field>

      {/* Xem trước: đúng thứ sẽ hiện trong danh sách giao dịch */}
      <div className="flex items-center gap-3 rounded-xl bg-[var(--surface-2)] p-3">
        <CategoryIcon icon={form.icon} color={form.color} />
        <span className="text-sm font-medium">{form.name || 'Tên danh mục'}</span>
      </div>

      <Button type="submit" loading={tao.isPending || sua.isPending} className="w-full">
        {editing ? 'Lưu thay đổi' : 'Thêm danh mục'}
      </Button>
    </form>
  );
}
