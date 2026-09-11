'use client';

import { Check, ChevronRight, Receipt, Users } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import {
  Badge, Button, CategoryIcon, EmptyState, ErrorState, Skeleton, cn,
} from '@/components/ui';
import { useDanhDauDaXet, useTransactions, useUpdateTransaction } from '@/hooks/useFinance';
import { CategoryPicker } from './CategoryPicker';
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
 * Sổ giao dịch.
 *
 * ⚠️ BẢN THIẾT KẾ LẠI — bỏ hẳn mô hình "mỗi ngày một Card viền + bảng `<table>` bên trong".
 * Đóng khung từng nhóm ngày làm màn hình thành một chồng hộp lặp lại, và bảng thì mang cảm
 * giác "sổ sách kế toán" hơn là một app dùng hằng ngày. Giờ toàn bộ sổ là MỘT dòng chảy liên
 * tục, phân cách bằng gạch mảnh (`divide-y`) — đúng cách các app ngân hàng/ví điện tử thật
 * trình bày lịch sử giao dịch: tiêu đề ngày chỉ là một dòng chữ đậm giữa dòng chảy, không
 * phải một hộp riêng.
 *
 * Vẫn giữ hành vi thu/mở theo ngày (ngày mới nhất mở sẵn) — hữu ích khi lịch sử dài — nhưng
 * bỏ luôn thẻ `<table>`: mỗi giao dịch giờ là một hàng flex thường, chi tiết mở ngay bên
 * dưới bằng một `<div>` chứ không phải `<tr colSpan>`.
 */
export function TransactionList({ filters = {} }: { filters?: TxFilters }) {
  const {
    data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useTransactions(filters);

  const danhDau = useDanhDauDaXet();
  const doiDanhMuc = useUpdateTransaction();
  const [dongLai, setDongLai] = useState<Set<string>>(new Set());
  const [moChiTiet, setMoChiTiet] = useState<string | null>(null);
  const [chonDanhMucCho, setChonDanhMucCho] = useState<Transaction | null>(null);

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
    return <ErrorState message={(error as ApiError).message} onRetry={() => void refetch()} />;
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
      {nhom.map((g, i) => {
        // Ngày mới nhất mở sẵn; những ngày sau thu gọn cho tới khi bấm
        const mo = i === 0 ? !dongLai.has(g.khoa) : dongLai.has(g.khoa);

        return (
          <div key={g.khoa} className={i > 0 ? 'mt-1 border-t pt-1' : ''}>
            {/*
              Tầng 1 (chevron + ngày + tổng) KHÔNG BAO GIỜ được tràn/xuống dòng — đây là thứ
              mắt quét qua để trả lời "hôm đó tiêu bao nhiêu". Tầng 2 (badge chưa xét) đặt
              dòng riêng bên dưới vì độ dài thay đổi thất thường.
            */}
            <button
              type="button"
              onClick={() => doiTrangThai(g.khoa)}
              className="flex w-full flex-col gap-1 rounded-xl px-1 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]"
            >
              <div className="flex items-center gap-2">
                <ChevronRight
                  size={15}
                  className={cn('muted shrink-0 transition-transform', mo && 'rotate-90')}
                />
                <span className="text-sm font-semibold">{nhanNgay(g.khoa)}</span>
                <span
                  className={cn(
                    'tabular ml-auto shrink-0 text-sm font-semibold',
                    g.net >= 0 ? 'text-income' : 'text-expense',
                  )}
                >
                  {g.net >= 0 ? '+' : '−'}
                  {formatMoney(Math.abs(g.net))}
                </span>
              </div>
              <div className="muted flex flex-wrap items-center gap-1.5 pl-[23px] text-xs">
                <span>{g.items.length} giao dịch</span>
                {g.chuaXet > 0 && <Badge tone="brand">{g.chuaXet} chưa xét</Badge>}
              </div>
            </button>

            {mo && (
              <div className="divide-y divide-[var(--border)] pl-[23px]">
                {g.items.map((t) => (
                  <Fragment key={t.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setMoChiTiet((cu) => (cu === t.id ? null : t.id))}
                      className="group flex cursor-pointer items-center gap-3 py-2.5 pr-1 pl-2"
                    >
                      {/* Vạch trái thay cho viền ô bảng cũ — chưa xét thì tô màu brand */}
                      <span
                        className={cn(
                          'h-8 w-[3px] shrink-0 rounded-full',
                          t.reviewedAt ? 'bg-transparent' : 'bg-brand',
                        )}
                        aria-hidden
                      />
                      {/*
                        Đây là thao tác CHÍNH của trang này: gán/sửa danh mục. Bấm thẳng vào
                        icon để mở picker, không cần mở chi tiết trước — hầu hết lượt bấm là
                        soát một dòng "Chưa phân loại" rồi gán ngay, không cần xem gì khác.
                      */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setChonDanhMucCho(t);
                        }}
                        className="shrink-0 rounded-xl transition hover:brightness-110"
                        aria-label={`Đổi danh mục cho "${t.note || 'giao dịch'}"`}
                        title="Đổi danh mục"
                      >
                        <CategoryIcon icon={t.category?.icon} color={t.category?.color} size="sm" />
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm" title={t.note ?? undefined}>
                          {t.note || '—'}
                        </p>
                        <p className="muted tabular text-xs">
                          {gio(t.date)} · {t.category?.name ?? 'Chưa phân loại'}
                        </p>
                      </div>

                      <span
                        className={cn(
                          'tabular shrink-0 text-sm font-semibold',
                          t.type === 'income' ? 'text-income' : 'text-expense',
                        )}
                      >
                        {t.type === 'income' ? '+' : '−'}
                        {formatMoney(t.amount)}
                      </span>

                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          '!size-8 shrink-0 transition',
                          t.reviewedAt && 'opacity-0 group-hover:opacity-100 focus:opacity-100',
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
                    </div>

                    {moChiTiet === t.id && (
                      /*
                        Chi tiết mở NGAY DƯỚI dòng — bạn đang dò một con số giữa danh sách,
                        nhảy sang cửa sổ khác là mất chỗ đang xem. Trước đây là `<tr colSpan>`
                        trong bảng; giờ chỉ là một `<div>` thường, không còn phụ thuộc cấu
                        trúc bảng nào cả.
                      */
                      <div className="bg-[var(--surface-2)] px-3 py-3 text-xs">
                        <dl className="space-y-1.5">
                          <div>
                            <dt className="muted">Nội dung đầy đủ</dt>
                            <dd className="break-words">{t.note || '—'}</dd>
                          </div>

                          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                            <span>
                              <dt className="muted inline">Thời điểm: </dt>
                              <dd className="tabular inline">
                                {formatDate(t.date)} {gio(t.date)}
                              </dd>
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
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            )}
          </div>
        );
      })}

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

      {chonDanhMucCho && (
        <CategoryPicker
          open
          onClose={() => setChonDanhMucCho(null)}
          type={chonDanhMucCho.type}
          currentId={chonDanhMucCho.category?.id}
          onSelect={(categoryId) =>
            doiDanhMuc.mutate({ id: chonDanhMucCho.id, categoryId })
          }
        />
      )}
    </>
  );
}
