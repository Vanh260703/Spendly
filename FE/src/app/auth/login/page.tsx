import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { LoginForm } from '@/components/auth/LoginForm';

// page.tsx là file MỎNG: chỉ ghép shell + feature component, không chứa logic
export default function LoginPage() {
  return (
    <AuthCard
      title="Đăng nhập"
      subtitle="Tiếp tục theo dõi chi tiêu của bạn"
      footer={
        <>
          Chưa có tài khoản?{' '}
          <Link href="/auth/register" className="font-medium text-brand">
            Đăng ký
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
