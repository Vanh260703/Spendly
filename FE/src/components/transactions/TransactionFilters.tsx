'use client';

import { Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, cn } from '@/components/ui';
import { useSoChuaXet } from '@/hooks/useFinance';

export interface BoLoc {
  q?: string;
  from?: string;
  to?: string;
  unreviewed?: boolean;
}

/**
 * Một hàng lọc: ô tìm + hai ô ngày.
 *
 * Dùng thẳng `<input type="date">` thay vì tự dựng danh sách kỳ ("hôm nay", "7 ngày"…) —
 * mấy nút đó chỉ là lối tắt cho việc mà hai ô ngày vốn đã làm được, và mỗi lối tắt lại là
 * một thứ phải nhớ nghĩa. Trình duyệt cũng đã có sẵn lịch, bàn phím số trên điện thoại, và
 * định dạng theo máy người dùng.
 *
 * Trạng thái nằm ở **URL query** (`?q=...&from=...&to=...`): F5 không mất bộ lọc, nút Back
 * hoạt động đúng, và gửi/lưu được đường dẫn kèm sẵn bộ lọc.
 */
export function TransactionFilters({ onChange }: { onChange: (b: BoLoc) => void }) {
  const router = useRouter();
  const params = useSearchParams();

  const { data: chuaXet } = useSoChuaXet();

  const q = params.get('q') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const chiChuaXet = params.get('unreviewed') === '1';

  const capNhat = (moi: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(moi)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    /*
     * `replace` chứ không `push`: gõ 10 ký tự tìm kiếm mà đẩy 10 mục vào lịch sử thì bấm
     * Back một lần chẳng đi đâu cả.
     */
    router.replace(p.toString() ? `?${p}` : '?', { scroll: false });

    onChange({
      q: (moi.q ?? q) || undefined,
      from: (moi.from ?? from) || undefined,
      to: (moi.to ?? to) || undefined,
      unreviewed: (moi.unreviewed ?? (chiChuaXet ? '1' : '')) === '1' || undefined,
    });
  };

  const coLoc = !!(q || from || to || chiChuaXet);

  return (
    <div className="flex items-center gap-2">
      {/* Ô tìm chiếm phần lớn chiều ngang — nó là thứ dùng thường xuyên nhất */}
      <div className="relative min-w-0 flex-1">
        <Search size={16} className="muted absolute top-1/2 left-3 -translate-y-1/2" />
        <Input
          value={q}
          onChange={(e) => capNhat({ q: e.target.value })}
          placeholder="Tìm theo nội dung chuyển khoản..."
          className="pl-9"
        />
      </div>

      <Input
        type="date"
        value={from}
        // Chặn ngay ở trình duyệt thay vì để chọn xong mới báo khoảng ngày ngược
        max={to || undefined}
        onChange={(e) => capNhat({ from: e.target.value })}
        className="w-36 shrink-0 px-2 text-sm"
        aria-label="Từ ngày"
      />
      <span className="muted shrink-0 text-sm">–</span>
      <Input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => capNhat({ to: e.target.value })}
        className="w-36 shrink-0 px-2 text-sm"
        aria-label="Đến ngày"
      />

      {/*
        Lối tắt tới hàng chờ. Con số bên cạnh là thứ trả lời "còn sót gì không?" — không có
        nó thì phải tự nhớ, mà tự nhớ chính là chỗ hỏng.
      */}
      <button
        type="button"
        onClick={() => capNhat({ unreviewed: chiChuaXet ? '' : '1' })}
        className={cn(
          'h-11 shrink-0 rounded-xl px-3 text-sm font-medium transition',
          chiChuaXet ? 'bg-brand text-white' : 'muted surface',
        )}
        title="Những khoản chưa xét có phần trả hộ người khác hay không"
      >
        Chưa xét
        {(chuaXet?.count ?? 0) > 0 && (
          <span
            className={cn(
              'ml-1.5 rounded-full px-1.5 py-0.5 text-xs tabular',
              chiChuaXet ? 'bg-white/25' : 'bg-brand text-white',
            )}
          >
            {chuaXet!.count}
          </span>
        )}
      </button>

      {/* Chỉ hiện khi thực sự có gì để xóa — nút mờ thường trực là rác thị giác */}
      {coLoc && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => capNhat({ q: '', from: '', to: '', unreviewed: '' })}
          aria-label="Xóa bộ lọc"
          title="Xóa bộ lọc"
        >
          <X size={16} />
        </Button>
      )}
    </div>
  );
}
