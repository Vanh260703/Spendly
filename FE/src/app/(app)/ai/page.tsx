'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, CircleCheck, Send, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { HealthScore } from '@/components/ai/HealthScore';
import { Button, Card, CardTitle, ErrorState, Input, Skeleton, cn } from '@/components/ui';
import { useByCategory } from '@/hooks/useFinance';
import { aiApi } from '@/lib/api';
import type { ApiError } from '@/lib/api/client';
import { formatMoney, formatPercent, formatPeriodLabel } from '@/lib/format';

const VERDICT = {
  keep: { nhan: 'Giữ nguyên', lop: 'bg-ok/15 text-ok' },
  reduce: { nhan: 'Nên giảm', lop: 'bg-warning/15 text-warning' },
  cut: { nhan: 'Nên cắt', lop: 'bg-exceeded/15 text-exceeded' },
} as const;

/**
 * Khi AI không dùng được (chưa cấu hình key, hết quota, lỗi nhà cung cấp) thì vẫn phải
 * cho user thấy SỐ LIỆU THẬT — mất phần tư vấn chứ không mất cả màn hình.
 */
function FallbackThongKe() {
  const { data } = useByCategory('week', 'expense');
  if (!data?.length) return null;

  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm font-medium">Thống kê tuần này</p>
      {data.slice(0, 6).map((c) => (
        <div key={c.category.id} className="flex items-center gap-2 text-sm">
          <span className="size-2.5 rounded-full" style={{ background: c.category.color }} />
          <span className="flex-1 truncate">{c.category.name}</span>
          <span className="muted text-xs">{c.count} lần</span>
          <span className="tabular font-medium">{formatMoney(c.total)}</span>
          {c.vsPrevious3Avg !== null && (
            <span className={cn('tabular w-12 text-right text-xs', c.vsPrevious3Avg > 0 ? 'text-expense' : 'text-income')}>
              {c.vsPrevious3Avg > 0 ? '+' : ''}
              {formatPercent(c.vsPrevious3Avg)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function AiPage() {
  const [tinNhan, setTinNhan] = useState('');
  const [hoiThoai, setHoiThoai] = useState<{ role: string; content: string }[]>([]);
  const [convId, setConvId] = useState<string | null>(null);

  /**
   * CHỈ ĐỌC bản do cron sinh — không gọi AI.
   *
   * `GET /ai/insights` chỉ truy DB nên luôn nhanh, miễn phí và không bao giờ đẻ thêm bản
   * ghi. Bản phân tích do `AiScheduler` sinh 08:00 sáng mỗi ngày cho tuần vừa khép lại.
   *
   * ⚠️ Đừng đổi lại thành `aiApi.necessityReview()`: cái đó SINH bản mới cho tuần ĐANG
   * chạy, tức mở trang là tốn quota và đẩy vào kho một bản dựng từ dữ liệu vài ngày.
   */
  const review = useQuery({
    queryKey: ['ai', 'insights', 'necessity'],
    queryFn: async () => (await aiApi.insights({ kind: 'necessity', limit: 1 }))[0] ?? null,
  });

  const chat = useMutation({
    mutationFn: (msg: string) => aiApi.chat({ message: msg, conversationId: convId }),
    onSuccess: (kq) => {
      setConvId(kq.conversationId);
      setHoiThoai((h) => [...h, { role: 'assistant', content: kq.reply }]);
    },
    onError: (e) =>
      setHoiThoai((h) => [
        ...h,
        { role: 'assistant', content: (e as ApiError).message ?? 'AI đang không phản hồi' },
      ]),
  });

  const guiChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tinNhan.trim()) return;
    setHoiThoai((h) => [...h, { role: 'user', content: tinNhan }]);
    chat.mutate(tinNhan);
    setTinNhan('');
  };

  const goiY = review.data?.structured?.suggestions ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Trợ lý AI</h1>

      {/*
        Báo cáo tổng kết kỳ KHÔNG nằm ở đây.
        Nó do cron sinh sau khi kỳ đóng và nằm ở /reports — xem SPEC §4.7. Trước đây trang
        này render <PeriodReport /> nên chỉ cần MỞ trang là gọi AI dựng báo cáo cho kỳ đang
        chạy: tốn quota cho một thứ không ai xin, và ghi đè lên kho báo cáo một bản dựng từ
        dữ liệu mới được vài ngày.
      */}
      <Link
        href="/reports"
        className="flex items-center justify-between rounded-xl bg-[var(--surface-2)] px-4 py-3 text-sm transition hover:opacity-80"
      >
        <span>
          <span className="font-medium">Báo cáo tuần &amp; tháng</span>
          <span className="muted block text-xs">Tự tổng kết sau khi mỗi kỳ khép lại</span>
        </span>
        <ArrowRight size={16} className="text-brand" />
      </Link>

      <HealthScore />

      <Card>
        <CardTitle
          action={
            review.data ? (
              <span className="muted text-xs">
                {formatPeriodLabel('weekly', review.data.periodStart, review.data.periodEnd)}
              </span>
            ) : null
          }
        >
          <span className="flex items-center gap-2">
            <Sparkles size={18} className="text-brand" /> Khoản nào không cần thiết?
          </span>
        </CardTitle>

        {review.isLoading ? (
          <Skeleton className="h-40" />
        ) : review.isError ? (
          <ErrorState
            message={(review.error as ApiError).message}
            onRetry={() => void review.refetch()}
          />
        ) : !review.data ? (
          /*
            Chưa có bản nào là chuyện bình thường với tài khoản mới — nói rõ khi nào sẽ có,
            đừng để trống làm user tưởng hỏng. KHÔNG đặt nút "phân tích ngay" ở đây: phân
            tích chỉ do cron sinh sau khi kỳ đóng.
          */
          <div className="space-y-3">
            <p className="muted text-sm">
              Chưa có phân tích nào. Sáng thứ Hai hàng tuần AI sẽ tự soi từng danh mục
              &ldquo;muốn&rdquo; của tuần vừa khép lại và chỉ ra khoản nào đáng cắt.
            </p>
            <FallbackThongKe />
          </div>
        ) : (
          <>
            {review.data.structured?.summary && (
              <p className="mb-3 text-sm">{review.data.structured.summary}</p>
            )}

            <div className="space-y-3">
              {goiY.map((g, i) => (
                <div key={i} className="rounded-xl bg-[var(--surface-2)] p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-medium">{g.categoryName}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', VERDICT[g.verdict]?.lop)}>
                      {VERDICT[g.verdict]?.nhan ?? g.verdict}
                    </span>
                  </div>

                  <p className="text-sm">{g.reason}</p>
                  {g.action && <p className="mt-1.5 text-sm text-brand">→ {g.action}</p>}

                  {g.monthlySaving > 0 && (
                    <p className="muted mt-1.5 text-xs">
                      Tiết kiệm được ~{formatMoney(g.monthlySaving)}/tháng
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/*
              Không có gợi ý nào là TIN TỐT, không phải lỗi — nghĩa là kỳ đó không có
              khoản `want` nào đáng cắt. Phải nói rõ điều đó.
            */}
            {!goiY.length && review.data.structured && (
              <p className="flex items-start gap-2 text-sm text-brand">
                <CircleCheck size={16} className="mt-0.5 shrink-0" />
                Không có khoản nào cần cắt giảm trong kỳ này.
              </p>
            )}

            {/*
              Fallback CHỈ khi AI trả về không đúng JSON (`structured` null).
              Trước đây điều kiện là `!goiY.length` — nên khi không có gợi ý nào,
              nó đổ nguyên chuỗi JSON thô ra màn hình.
            */}
            {!review.data.structured && review.data.content && (
              <p className="text-sm whitespace-pre-wrap">{review.data.content}</p>
            )}
          </>
        )}
      </Card>

      <Card>
        <CardTitle>Hỏi đáp</CardTitle>

        <div className="mb-3 max-h-80 space-y-2 overflow-y-auto">
          {!hoiThoai.length && (
            <p className="muted text-sm">
              Thử hỏi: &ldquo;Tháng này tôi tiêu ăn uống nhiều hơn bình thường không?&rdquo;
            </p>
          )}

          {hoiThoai.map((m, i) => (
            <div
              key={i}
              className={cn(
                'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap',
                m.role === 'user'
                  ? 'ml-auto bg-brand text-white'
                  : 'bg-[var(--surface-2)]',
              )}
            >
              {m.content}
            </div>
          ))}

          {chat.isPending && (
            <div className="muted max-w-[85%] rounded-2xl bg-[var(--surface-2)] px-3.5 py-2 text-sm">
              Đang suy nghĩ...
            </div>
          )}
        </div>

        <form onSubmit={guiChat} className="flex gap-2">
          <Input
            value={tinNhan}
            onChange={(e) => setTinNhan(e.target.value)}
            placeholder="Hỏi về tình hình tài chính của bạn..."
          />
          <Button type="submit" loading={chat.isPending} aria-label="Gửi">
            <Send size={18} />
          </Button>
        </form>
      </Card>
    </div>
  );
}
