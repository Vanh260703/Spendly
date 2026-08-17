import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Xuất tĩnh để deploy lên Cloudflare Pages.
   *
   * App này gọi API bên ngoài hoàn toàn từ client (TanStack Query), không có SSR data
   * fetching, server action hay middleware — nên bản tĩnh chạy đủ tính năng mà không cần
   * adapter Workers, không cold start, và Cloudflare phục vụ thẳng từ CDN.
   *
   * ⚠️ Đánh đổi: mất `next/image` tối ưu động (đã tắt bên dưới), không dùng được route
   * handler `app/api/*` — nhưng dự án không cần vì BE tách riêng.
   */
  output: 'export',

  // Cloudflare Pages phục vụ /duong-dan/ → /duong-dan/index.html
  trailingSlash: true,

  images: { unoptimized: true },

  typedRoutes: true,
};

export default nextConfig;
