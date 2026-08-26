import { redirect } from 'next/navigation';

/** Không còn onboarding — tài khoản ngân hàng khai trong `.env`, vào thẳng dòng tiền */
export default function HomePage() {
  redirect('/transactions');
}
