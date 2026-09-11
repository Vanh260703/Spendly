'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui';

/**
 * Khoảng ngày lọc sổ giao dịch — tách khỏi `TransactionFilters` (tìm kiếm + "chưa xét")
 * vì đây là hai khái niệm lọc khác nhau, mỗi cái nên tự quản lý query key của mình.
 *
 * Trạng thái vẫn nằm ở URL query (`?from=...&to=...`), CHUNG với `TransactionFilters` —
 * cả hai đọc/ghi cùng một `URLSearchParams`, mỗi bên chỉ đụng vào key của mình nên không
 * giẫm lên nhau.
 */
export function DateRangeFilter({ onChange }: { onChange: (v: { from?: string; to?: string }) => void }) {
  const router = useRouter();
  const params = useSearchParams();

  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  const capNhat = (moi: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(moi)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.replace(p.toString() ? `?${p}` : '?', { scroll: false });
    onChange({
      from: (moi.from ?? from) || undefined,
      to: (moi.to ?? to) || undefined,
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => capNhat({ from: e.target.value })}
        className="min-w-0 flex-1 px-2 text-sm"
        aria-label="Từ ngày"
      />
      <span className="muted shrink-0 text-sm">–</span>
      <Input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => capNhat({ to: e.target.value })}
        className="min-w-0 flex-1 px-2 text-sm"
        aria-label="Đến ngày"
      />
    </div>
  );
}
