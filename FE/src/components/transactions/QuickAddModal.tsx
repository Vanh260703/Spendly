'use client';

import { useState } from 'react';
import { SplitBillForm } from '@/components/friends/SplitBillForm';
import { QuickAddForm } from '@/components/transactions/QuickAddForm';
import { Modal, cn } from '@/components/ui';

const TAB = [
  { v: 'thu-chi', nhan: 'Thu / Chi' },
  { v: 'chia-bill', nhan: 'Chia bill' },
] as const;

type TabValue = (typeof TAB)[number]['v'];

/**
 * Modal "Ghi khoản" — dùng chung cho Tổng quan và Giao dịch, thay vì mỗi trang tự dựng
 * `<Modal>` riêng rồi lệch nhau khi sửa một bên.
 *
 * Hai tầng chọn là CỐ Ý: tab ở đây chọn KIỂU ghi chép, còn thanh `Chi | Thu` bên trong
 * `QuickAddForm` mới chọn chiều tiền. Nhét "Chia bill" thành mảnh thứ ba của thanh đó
 * sẽ trộn hai khái niệm khác hẳn nhau vào cùng một chỗ, mà nội dung form lại đổi hoàn toàn.
 */
export function QuickAddModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<TabValue>('thu-chi');

  /**
   * Về lại tab mặc định mỗi lần đóng. Thu/chi chiếm gần hết số lần dùng, nên mở ra mà gặp
   * form chia bill còn sót từ lần trước là bất ngờ không đáng có.
   */
  const dong = () => {
    setTab('thu-chi');
    onClose();
  };

  return (
    <Modal open={open} onClose={dong} title="Ghi khoản">
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-[var(--surface-2)] p-1">
        {TAB.map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => setTab(t.v)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition',
              tab === t.v ? 'bg-brand text-white' : 'muted',
            )}
          >
            {t.nhan}
          </button>
        ))}
      </div>

      {tab === 'thu-chi' ? <QuickAddForm onDone={dong} /> : <SplitBillForm onDone={dong} />}
    </Modal>
  );
}
