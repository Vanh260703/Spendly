import { redirect } from 'next/navigation';

/** Không còn onboarding — tài khoản ngân hàng khai trong `.env`, vào thẳng Tổng quan */
export default function HomePage() {
  redirect('/dashboard');
}
