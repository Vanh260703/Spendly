'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Wallet } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Field, MoneyInput } from '@/components/ui';
import { useOnboarding } from '@/hooks/useAuth';

const schema = z.object({
  initialBalance: z.coerce.number().int().nonnegative('Số tiền không được âm'),
  monthlyIncome: z.coerce.number().int().nonnegative().optional(),
});
type FormData = z.infer<typeof schema>;

/**
 * Thiết lập ban đầu — chỉ hỏi 2 câu.
 *
 * `initialBalance` là mốc xuất phát, đặt MỘT LẦN: app không biết lịch sử trước khi cài,
 * nên nếu không khai thì chỉ tính được chênh lệch thu-chi chứ không biết đang cầm bao nhiêu.
 */
export default function OnboardingPage() {
  const onboarding = useOnboarding();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand text-white">
            <Wallet size={24} />
          </span>
          <h1 className="text-2xl font-bold">Thiết lập ban đầu</h1>
          <p className="muted mt-1 text-sm">Hai câu hỏi thôi, sau đó bắt đầu ghi chép</p>
        </div>

        <form
          onSubmit={handleSubmit((d) => onboarding.mutate(d))}
          className="surface space-y-5 rounded-2xl p-6"
        >
          <Field
            label="Hiện tại bạn có tổng cộng bao nhiêu tiền?"
            error={errors.initialBalance?.message}
            hint="Cộng hết tiền mặt và mọi tài khoản. Đây là mốc xuất phát, chỉ khai một lần."
          >
            <Controller
              control={control}
              name="initialBalance"
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

          <Field
            label="Thu nhập hàng tháng khoảng bao nhiêu?"
            error={errors.monthlyIncome?.message}
            hint="Không bắt buộc — dùng để gợi ý ngân sách và để AI tính % trên thu nhập"
          >
            <Controller
              control={control}
              name="monthlyIncome"
              render={({ field }) => (
                <MoneyInput
                  value={(field.value as number | undefined) ?? ''}
                  onChange={(v) => field.onChange(v === '' ? undefined : v)}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  placeholder="0"
                />
              )}
            />
          </Field>

          <Button type="submit" loading={onboarding.isPending} className="w-full" size="lg">
            Bắt đầu
          </Button>
        </form>
      </div>
    </div>
  );
}
