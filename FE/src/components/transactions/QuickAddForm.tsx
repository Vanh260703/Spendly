'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Button, Field, Input, MoneyInput, Select, cn } from '@/components/ui';
import { useCategories, useCreateTransaction } from '@/hooks/useFinance';
import { toDateInputValue } from '@/lib/format';

const schema = z.object({
  amount: z.coerce.number().int().positive('Số tiền phải lớn hơn 0'),
  categoryId: z.string().min(1, 'Vui lòng chọn danh mục'),
  date: z.string().min(1),
  note: z.string().max(500).optional(),
});
type FormData = z.infer<typeof schema>;

/** Số tiền hay dùng — bấm một phát thay vì gõ 6 chữ số */
const GOI_Y = [20_000, 50_000, 100_000, 200_000, 500_000];

export function QuickAddForm({ onDone }: { onDone?: () => void }) {
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const { data: categories } = useCategories({ type });
  const taoGiaoDich = useCreateTransaction();

  const {
    register, handleSubmit, reset, setValue, control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: toDateInputValue() },
  });

  // Đổi thu↔chi thì danh mục cũ không còn hợp lệ (BE trả 400 nếu lệch chiều tiền)
  useEffect(() => setValue('categoryId', ''), [type, setValue]);

  const onSubmit = (d: FormData) =>
    taoGiaoDich.mutate(
      {
        type,
        amount: d.amount,
        categoryId: d.categoryId,
        date: new Date(`${d.date}T12:00:00`).toISOString(),
        note: d.note || null,
      },
      {
        onSuccess: () => {
          // Giữ nguyên ngày + loại để nhập liên tiếp nhiều khoản trong cùng một ngày
          reset({ date: d.date, amount: undefined, categoryId: '', note: '' });
          onDone?.();
        },
      },
    );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Chi đặt trước vì đó là thao tác chiếm ~90% lần dùng */}
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--surface-2)] p-1">
        {(['expense', 'income'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              'rounded-lg py-2 text-sm font-medium transition',
              type === t
                ? t === 'expense'
                  ? 'bg-expense text-white'
                  : 'bg-income text-white'
                : 'muted',
            )}
          >
            {t === 'expense' ? 'Khoản chi' : 'Khoản thu'}
          </button>
        ))}
      </div>

      <Field label="Số tiền" error={errors.amount?.message}>
        <Controller
          control={control}
          name="amount"
          render={({ field }) => (
            <MoneyInput
              value={(field.value as number | undefined) ?? ''}
              onChange={(v) => field.onChange(v === '' ? undefined : v)}
              onBlur={field.onBlur}
              ref={field.ref}
              placeholder="0"
              autoFocus
              className="text-lg font-semibold"
            />
          )}
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        {GOI_Y.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setValue('amount', v as never, { shouldValidate: true })}
            className="surface rounded-lg px-2.5 py-1 text-xs hover:bg-[var(--surface-2)]"
          >
            {v.toLocaleString('vi-VN')}
          </button>
        ))}
      </div>

      <Field label="Danh mục" error={errors.categoryId?.message}>
        <Select {...register('categoryId')}>
          <option value="">— Chọn danh mục —</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Ngày" error={errors.date?.message}>
        <Input {...register('date')} type="date" />
      </Field>

      <Field label="Ghi chú">
        <Input {...register('note')} placeholder="Cà phê sáng với team" />
      </Field>

      <Button type="submit" loading={taoGiaoDich.isPending} className="w-full" size="lg">
        Ghi lại
      </Button>
    </form>
  );
}
