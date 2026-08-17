import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { RegisterForm } from '@/components/auth/RegisterForm';

export default function RegisterPage() {
  return (
    <AuthCard
      title="Tạo tài khoản"
      subtitle="Bắt đầu quản lý chi tiêu trong 30 giây"
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link href="/auth/login" className="font-medium text-brand">
            Đăng nhập
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
