/** Thanh tiến độ. `tone` để gọi đúng ngữ nghĩa thay vì truyền màu thô từ chỗ gọi. */
export function Progress({
  value,
  tone = 'brand',
}: {
  value: number;
  tone?: 'brand' | 'ok' | 'warning' | 'exceeded';
}) {
  const mau = {
    brand: 'bg-brand',
    ok: 'bg-ok',
    warning: 'bg-warning',
    exceeded: 'bg-exceeded',
  }[tone];

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
      <div
        className={`h-full rounded-full transition-all ${mau}`}
        // Chặn ở 100% để thanh không tràn khỏi khung khi vượt ngân sách
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}
