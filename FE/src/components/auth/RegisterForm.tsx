'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Field, Input } from '@/components/ui';
import { useRegister } from '@/hooks/useAuth';

// Khớp với schema BE — sai lệch sẽ khiến user bị báo lỗi sau khi bấm gửi
// thay vì được cảnh báo ngay lúc gõ
const schema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên').max(100),
  email: z.string().min(1, 'Vui lòng nhập email').email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu phải có ít nhất 8 ký tự').max(72),
});
type FormData = z.infer<typeof schema>;

export function RegisterForm() {
  const dangKy = useRegister();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  return (
    <form onSubmit={handleSubmit((d) => dangKy.mutate(d))} className="space-y-4">
      <Field label="Tên của bạn" error={errors.name?.message}>
        <Input {...register('name')} placeholder="Việt Anh" autoComplete="name" />
      </Field>

      <Field label="Email" error={errors.email?.message}>
        <Input {...register('email')} type="email" placeholder="ban@example.com" autoComplete="email" />
      </Field>

      <Field label="Mật khẩu" error={errors.password?.message} hint="Ít nhất 8 ký tự">
        <Input {...register('password')} type="password" placeholder="••••••••" autoComplete="new-password" />
      </Field>

      <Button type="submit" loading={dangKy.isPending} className="w-full">
        Tạo tài khoản
      </Button>
    </form>
  );
}
