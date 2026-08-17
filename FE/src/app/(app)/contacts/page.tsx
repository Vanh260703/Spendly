'use client';

import { Receipt, Search, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { ContactDetail } from '@/components/friends/ContactDetail';
import { SplitBillForm } from '@/components/friends/SplitBillForm';
import {
  Button, Card, EmptyState, ErrorState, Input, Modal, Skeleton, cn,
} from '@/components/ui';
import { useContacts, useDeleteContact } from '@/hooks/useFriends';
import type { ApiError } from '@/lib/api/client';
import { formatMoney } from '@/lib/format';
import type { Contact } from '@/types';

/**
 * Danh bạ — vừa là nơi quản lý bạn bè, vừa LÀ màn hình trả lời "ai đang nợ mình bao nhiêu".
 * Vì vậy không có thêm một trang "công nợ" riêng nào nữa.
 */
export default function ContactsPage() {
  const [tim, setTim] = useState('');
  const { data, isLoading, isError, error, refetch } = useContacts({ q: tim || undefined });
  const xoa = useDeleteContact();

  const [moChiaBill, setMoChiaBill] = useState(false);
  const [dangXem, setDangXem] = useState<Contact | null>(null);

  const hoNoToi = (data ?? []).filter((c) => c.balance > 0);
  const toiNoHo = (data ?? []).filter((c) => c.balance < 0);
  const songPhang = (data ?? []).filter((c) => c.balance === 0);

  const tongHoNo = hoNoToi.reduce((t, c) => t + c.balance, 0);
  const tongToiNo = toiNoHo.reduce((t, c) => t - c.balance, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Danh bạ</h1>
        <Button onClick={() => setMoChiaBill(true)}>
          <Receipt size={16} /> Chia bill
        </Button>
      </div>

      {/* Hai con số tổng — thứ người ta mở trang này để xem đầu tiên */}
      {(tongHoNo > 0 || tongToiNo > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="text-center">
            <p className="muted text-xs">Bạn bè nợ bạn</p>
            <p className="tabular text-xl font-semibold text-income">{formatMoney(tongHoNo)}</p>
          </Card>
          <Card className="text-center">
            <p className="muted text-xs">Bạn đang nợ</p>
            <p className="tabular text-xl font-semibold text-expense">{formatMoney(tongToiNo)}</p>
          </Card>
        </div>
      )}

      <div className="relative">
        <Search size={16} className="muted absolute top-1/2 left-3 -translate-y-1/2" />
        <Input
          value={tim}
          onChange={(e) => setTim(e.target.value)}
          placeholder="Tìm theo tên..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : isError ? (
        <ErrorState message={(error as ApiError).message} onRetry={() => void refetch()} />
      ) : !data?.length ? (
        <EmptyState
          icon={Users}
          title={tim ? 'Không tìm thấy ai' : 'Danh bạ còn trống'}
          description={
            tim
              ? 'Thử một cái tên khác.'
              : 'Bấm "Chia bill" để ghi lần trả hộ đầu tiên — gõ tên là người đó tự vào danh bạ.'
          }
        />
      ) : (
        <div className="space-y-4">
          {[
            { ten: 'Đang nợ bạn', ds: hoNoToi },
            { ten: 'Bạn đang nợ', ds: toiNoHo },
            { ten: 'Đã sòng phẳng', ds: songPhang },
          ]
            .filter((nhom) => nhom.ds.length > 0)
            .map((nhom) => (
              <div key={nhom.ten} className="space-y-2">
                <p className="muted text-xs font-medium">{nhom.ten}</p>
                {nhom.ds.map((c) => (
                  <Card key={c.id} className="!p-0">
                    <div className="flex items-center gap-3 p-3">
                      <button
                        type="button"
                        onClick={() => setDangXem(c)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span
                          className="flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white"
                          style={{ background: c.color }}
                        >
                          {c.name.trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{c.name}</span>
                          {c.phone && <span className="muted block text-xs">{c.phone}</span>}
                        </span>
                        <span
                          className={cn(
                            'tabular shrink-0 text-sm font-medium',
                            c.balance > 0 ? 'text-income' : c.balance < 0 ? 'text-expense' : 'muted',
                          )}
                        >
                          {c.balance === 0 ? '—' : formatMoney(Math.abs(c.balance))}
                        </span>
                      </button>

                      {c.balance === 0 && (
                        <button
                          type="button"
                          onClick={() => xoa.mutate(c.id)}
                          className="muted shrink-0 p-1"
                          aria-label={`Xóa ${c.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            ))}
        </div>
      )}

      <Modal open={moChiaBill} onClose={() => setMoChiaBill(false)} title="Chia bill">
        <SplitBillForm onDone={() => setMoChiaBill(false)} />
      </Modal>

      <Modal open={!!dangXem} onClose={() => setDangXem(null)} title={dangXem?.name ?? ''}>
        {dangXem && (
          <ContactDetail contactId={dangXem.id} onClose={() => setDangXem(null)} />
        )}
      </Modal>
    </div>
  );
}
