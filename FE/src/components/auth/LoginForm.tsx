'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Field, Input } from '@/components/ui';
import { useLogin } from '@/hooks/useAuth';

const schema = z.object({
  email: z.string().min(1, 'Vui lòng nhập email').email('Email không hợp lệ'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});
type FormData = z.infer<typeof schema>;

export function LoginForm() {
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  return (
    <form onSubmit={handleSubmit((d) => login.mutate(d))} className="space-y-4">
      <Field label="Email" error={errors.email?.message}>
        <Input {...register('email')} type="email" placeholder="ban@example.com" autoComplete="email" />
      </Field>

      <Field label="Mật khẩu" error={errors.password?.message}>
        <Input {...register('password')} type="password" placeholder="••••••••" autoComplete="current-password" />
      </Field>

      {/* Loading lấy từ mutation, không tự quản state riêng */}
      <Button type="submit" loading={login.isPending} className="w-full">
        Đăng nhập
      </Button>
    </form>
  );
}
