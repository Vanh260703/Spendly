'use client';

import { Check, ChevronRight, Receipt, Users } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, Skeleton, cn } from '@/components/ui';
import { useDanhDauDaXet, useTransactions } from '@/hooks/useFinance';
import type { TxFilters } from '@/lib/api';
import type { ApiError } from '@/lib/api/client';
import { formatDate, formatMoney } from '@/lib/format';
import type { Transaction } from '@/types';

const THU = ['CN', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7'];

/** `"2026-08-28T13:16:00Z"` → khóa nhóm theo ngày ĐỊA PHƯƠNG */
function khoaNgay(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function nhanNgay(khoa: string): string {
  const [y, m, d] = khoa.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const homNay = khoaNgay(new Date().toISOString());
  if (khoa === homNay) return 'Hôm nay';
  return `${THU[dt.getDay()]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function gio(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Nhom {
  khoa: string;
  items: Transaction[];
  net: number;
  chuaXet: number;
}

/**
 * Sổ giao dịch — **gom theo ngày, mặc định thu gọn**.
 *
 * Đổ hết vài chục dòng phẳng ra màn hình thì mắt không bám được vào đâu: ngày lặp lại ở mọi
 * dòng, và không thấy được "hôm đó tiêu bao nhiêu". Gom theo ngày cho một tầng tóm tắt —
 * lướt qua các ngày trước, mở đúng ngày cần xem.
 *
 * Ngày mới nhất mở sẵn: mở app ra là thấy ngay cái vừa xảy ra, không phải bấm.
 */
export function TransactionList({ filters = {} }: { filters?: TxFilters }) {
  const {
    data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useTransactions(filters);

  const danhDau = useDanhDauDaXet();
  const [dongLai, setDongLai] = useState<Set<string>>(new Set());
  const [moChiTiet, setMoChiTiet] = useState<string | null>(null);

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  const nhom = useMemo<Nhom[]>(() => {
    const m = new Map<string, Nhom>();
    for (const t of items) {
      const khoa = khoaNgay(t.date);
      const g = m.get(khoa) ?? { khoa, items: [], net: 0, chuaXet: 0 };
      g.items.push(t);
      g.net += t.type === 'income' ? t.amount : -t.amount;
      if (!t.reviewedAt) g.chuaXet += 1;
      m.set(khoa, g);
    }
    return [...m.values()];
  }, [items]);

  if (isLoading) return <Skeleton className="h-64" />;

  if (isError) {
    // Lỗi mà hiện "chưa có giao dịch nào" là user tưởng mất sạch dữ liệu
    return (
      <Card>
        <ErrorState message={(error as ApiError).message} onRetry={() => void refetch()} />
      </Card>
    );
  }

  if (!items.length) {
    return (
      <EmptyState
        icon={Receipt}
        title="Chưa có giao dịch nào"
        description={'Bấm "Đồng bộ" ở trên để kéo giao dịch từ ngân hàng về.'}
      />
    );
  }

  const doiTrangThai = (khoa: string) =>
    setDongLai((cu) => {
      const moi = new Set(cu);
      moi.has(khoa) ? moi.delete(khoa) : moi.add(khoa);
      return moi;
    });

  return (
    <>
      <div className="space-y-2">
        {nhom.map((g, i) => {
          // Ngày mới nhất mở sẵn; những ngày sau thu gọn cho tới khi bấm
          const mo = i === 0 ? !dongLai.has(g.khoa) : dongLai.has(g.khoa);

          return (
            <Card key={g.khoa} className="!p-0">
              <button
                type="button"
                onClick={() => doiTrangThai(g.khoa)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
              >
                <ChevronRight
                  size={15}
                  className={cn('muted shrink-0 transition-transform', mo && 'rotate-90')}
                />

                <span className="text-sm font-medium">{nhanNgay(g.khoa)}</span>

                <span className="muted text-xs">
                  {g.items.length} giao dịch
                  {/* Số chưa xét đặt ngay ở đầu ngày — không phải mở ra mới biết còn sót */}
                  {g.chuaXet > 0 && (
                    <span className="ml-1.5 rounded-full bg-brand px-1.5 py-0.5 text-white">
                      {g.chuaXet} chưa xét
                    </span>
                  )}
                </span>

                {/* Net của ngày: thứ trả lời "hôm đó tiêu bao nhiêu" mà không cần mở ra */}
                <span
                  className={cn(
                    'tabular ml-auto shrink-0 text-sm font-semibold',
                    g.net >= 0 ? 'text-income' : 'text-expense',
                  )}
                >
                  {g.net >= 0 ? '+' : '−'}
                  {formatMoney(Math.abs(g.net))}
                </span>

                {/*
                  Khoảng đệm khớp ĐÚNG cột nút ✓ ở dòng con (`w-9`).
                  Không có nó thì tổng của ngày lệch sang phải 36px so với số tiền từng
                  dòng — mắt phải nhảy qua nhảy lại khi dò xem tổng có khớp không.
                */}
                <span className="w-9 shrink-0" aria-hidden />
              </button>

              {mo && (
                <table className="w-full border-t text-sm">
                  <tbody className="divide-y">
                    {g.items.map((t) => (
                      <Fragment key={t.id}>
                      <tr
                        className="group cursor-pointer"
                        onClick={() => setMoChiTiet((cu) => (cu === t.id ? null : t.id))}
                      >
                        {/* Chỉ GIỜ — ngày đã nằm ở tiêu đề nhóm, lặp lại là thừa */}
                        <td
                          className={cn(
                            'muted tabular w-14 border-l-2 py-2 pl-3 whitespace-nowrap',
                            t.reviewedAt ? 'border-transparent' : 'border-brand',
                          )}
                        >
                          {gio(t.date)}
                        </td>

                        {/* `max-w-0` + `truncate`: nội dung dài không đẩy cột tiền ra ngoài */}
                        <td className="max-w-0 px-2 py-2">
                          <span className="block truncate" title={t.note ?? undefined}>
                            {t.note || '—'}
                          </span>
                        </td>

                        <td
                          className={cn(
                            'tabular py-2 pr-3 pl-2 text-right font-semibold whitespace-nowrap',
                            t.type === 'income' ? 'text-income' : 'text-expense',
                          )}
                        >
                          {t.type === 'income' ? '+' : '−'}
                          {formatMoney(t.amount)}
                        </td>

                        <td className="w-9 py-1 pr-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              'transition',
                              t.reviewedAt &&
                                'opacity-0 group-hover:opacity-100 focus:opacity-100',
                            )}
                            loading={danhDau.isPending && danhDau.variables?.id === t.id}
                            // Chặn nổi bọt: bấm ✓ không được kéo theo mở/đóng chi tiết
                            onClick={(e) => {
                              e.stopPropagation();
                              danhDau.mutate({ id: t.id, reviewed: !t.reviewedAt });
                            }}
                            aria-label={t.reviewedAt ? 'Bỏ đánh dấu' : 'Đánh dấu đã xét'}
                            title={
                              t.reviewedAt
                                ? 'Đã xét — bấm để trả về hàng chờ'
                                : 'Không có phần trả hộ, đánh dấu đã xét'
                            }
                          >
                            <Check size={15} className={t.reviewedAt ? 'muted' : 'text-ok'} />
                          </Button>
                        </td>
                      </tr>

                      {moChiTiet === t.id && (
                        <tr>
                          {/*
                            Chi tiết mở NGAY DƯỚI dòng, không phải modal: bạn đang dò một
                            con số giữa danh sách, nhảy sang cửa sổ khác là mất chỗ đang xem.
                          */}
                          <td colSpan={4} className="bg-[var(--surface-2)] px-3 py-3">
                            <dl className="space-y-1.5 text-xs">
                              <div>
                                <dt className="muted">Nội dung đầy đủ</dt>
                                {/* `break-words`: nội dung ngân hàng có chuỗi dài không dấu cách */}
                                <dd className="break-words">{t.note || '—'}</dd>
                              </div>

                              <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                                <span>
                                  <dt className="muted inline">Thời điểm: </dt>
                                  <dd className="tabular inline">{formatDate(t.date)} {gio(t.date)}</dd>
                                </span>
                                {t.referenceCode && (
                                  <span>
                                    <dt className="muted inline">Mã tham chiếu: </dt>
                                    <dd className="tabular inline">{t.referenceCode}</dd>
                                  </span>
                                )}
                                {t.sepayId !== null && (
                                  <span>
                                    <dt className="muted inline">SePay ID: </dt>
                                    <dd className="tabular inline">{t.sepayId}</dd>
                                  </span>
                                )}
                              </div>

                              {/* Đã chia cho bạn bè thì cho thấy luôn ai gánh bao nhiêu */}
                              {t.split && (
                                <div className="mt-2 rounded-lg bg-[var(--surface)] p-2">
                                  <p className="muted mb-1 flex items-center gap-1.5">
                                    <Users size={12} />
                                    Đã chia{t.split.note ? ` · ${t.split.note}` : ''}
                                  </p>
                                  {t.split.shares.map((sh, i) => (
                                    <div key={i} className="flex justify-between">
                                      <span>{sh.name}</span>
                                      <span className="tabular">{formatMoney(sh.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </dl>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          );
        })}
      </div>

      {hasNextPage && (
        <Button
          variant="secondary"
          className="mt-3 w-full"
          loading={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          Xem thêm
        </Button>
      )}
    </>
  );
}
