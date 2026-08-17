import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const font = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-be-vietnam',
});

export const metadata: Metadata = {
  title: 'Spendly — Quản lý tài chính cá nhân',
  description: 'Ghi chép thu chi, lập ngân sách, đặt mục tiêu và nhận tư vấn từ AI',
};

export const viewport: Viewport = {
  themeColor: '#10b981',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        {/*
          Đặt theme TRƯỚC khi React render để không bị "nháy trắng" một khung hình
          khi user đang dùng dark mode. Script chặn render nên phải thật ngắn.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('spendly-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className={`${font.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
