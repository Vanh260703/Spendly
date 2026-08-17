'use client';

import { CircleCheck, TriangleAlert } from 'lucide-react';
import type { AiInsight } from '@/types';

/**
 * Phần thân của một báo cáo kỳ — dùng chung cho báo cáo kỳ hiện tại (`/ai`) và
 * kho báo cáo đã lưu (`/reports`). Tách ra để hai chỗ không hiển thị khác nhau.
 */
export function ReportBody({ insight }: { insight: AiInsight }) {
  const s = insight.structured;

  // AI trả không đúng JSON → vẫn cho đọc phần text, khỏi mất trắng
  if (!s) {
    return insight.content ? (
      <p className="text-sm whitespace-pre-wrap">{insight.content}</p>
    ) : null;
  }

  const trong = !s.summary && !s.highlights?.length && !s.actions?.length;
  if (trong) return <p className="muted text-sm">Kỳ này chưa đủ dữ liệu để làm báo cáo.</p>;

  return (
    <div className="space-y-4">
      {s.summary && <p className="text-sm">{s.summary}</p>}

      {!!s.highlights?.length && (
        <div className="grid gap-2 sm:grid-cols-2">
          {s.highlights.map((h, i) => (
            <div key={i} className="rounded-xl bg-[var(--surface-2)] p-3">
              <p className="muted text-xs">{h.label}</p>
              <p className="tabular font-semibold">{h.value}</p>
              {h.note && <p className="muted mt-0.5 text-xs">{h.note}</p>}
            </div>
          ))}
        </div>
      )}

      {!!s.warnings?.length && (
        <div className="space-y-1.5">
          {s.warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-2 text-sm text-warning">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" />
              {w}
            </p>
          ))}
        </div>
      )}

      {!!s.actions?.length && (
        <div>
          <p className="mb-2 text-sm font-medium">Việc nên làm</p>
          <ol className="space-y-2.5">
            {s.actions.map((a, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                  {i + 1}
                </span>
                <span className="text-sm">
                  <span className="font-medium">{a.title}</span>
                  <span className="muted block">{a.detail}</span>
                  {a.impact && (
                    <span className="mt-0.5 flex items-start gap-1 text-xs text-brand">
                      <CircleCheck size={13} className="mt-0.5 shrink-0" />
                      {a.impact}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
