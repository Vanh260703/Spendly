'use client';

import { Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge, Button, Input, cn } from '@/components/ui';
import { useSoChuaXet } from '@/hooks/useFinance';

export interface BoLoc {
  q?: string;
  unreviewed?: boolean;
}

/**
 * Tìm theo nội dung + lối tắt "chưa xét" — chỉ có nghĩa ở SỔ GIAO DỊCH, không ảnh hưởng
 * tới bất kỳ thống kê nào (`useSummary`/`useTrend`/`useByCategory`/`useAnomalies` không nhận
 * `q` hay `unreviewed`). Vì vậy tách khỏi `DateRangeFilter`.
 *
 * Trạng thái vẫn ở URL query, chung `URLSearchParams` với `DateRangeFilter`.
 */
export function TransactionFilters({ onChange }: { onChange: (b: BoLoc) => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const { data: chuaXet } = useSoChuaXet();

  const q = params.get('q') ?? '';
  const chiChuaXet = params.get('unreviewed') === '1';

  const capNhat = (moi: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(moi)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.replace(p.toString() ? `?${p}` : '?', { scroll: false });
    onChange({
      q: (moi.q ?? q) || undefined,
      unreviewed: (moi.unreviewed ?? (chiChuaXet ? '1' : '')) === '1' || undefined,
    });
  };

  const coLoc = !!(q || chiChuaXet);

  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search size={16} className="muted absolute top-1/2 left-3 -translate-y-1/2" />
        <Input
          value={q}
          onChange={(e) => capNhat({ q: e.target.value })}
          placeholder="Tìm theo nội dung chuyển khoản..."
          className="pl-9"
        />
      </div>

      {/*
        Lối tắt tới hàng chờ. Con số bên cạnh là thứ trả lời "còn sót gì không?" — không có
        nó thì phải tự nhớ, mà tự nhớ chính là chỗ hỏng.
      */}
      <button
        type="button"
        onClick={() => capNhat({ unreviewed: chiChuaXet ? '' : '1' })}
        className={cn(
          'h-11 shrink-0 rounded-[var(--radius-control)] px-3 text-sm font-medium whitespace-nowrap transition-all',
          chiChuaXet ? 'bg-brand text-white elevation-brand' : 'muted surface hover:elevation-sm',
        )}
        title="Những khoản chưa xét có phần trả hộ người khác hay không"
      >
        Chưa xét
        {(chuaXet?.count ?? 0) > 0 && (
          <Badge tone={chiChuaXet ? 'on-color' : 'brand'} className="tabular ml-1.5">
            {chuaXet!.count}
          </Badge>
        )}
      </button>

      {coLoc && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => capNhat({ q: '', unreviewed: '' })}
          aria-label="Xóa bộ lọc"
          title="Xóa bộ lọc"
        >
          <X size={16} />
        </Button>
      )}
    </div>
  );
}
