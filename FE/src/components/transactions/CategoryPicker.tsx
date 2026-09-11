'use client';

import { CategoryIcon, ErrorState, Modal, Skeleton } from '@/components/ui';
import { useCategories } from '@/hooks/useFinance';
import type { ApiError } from '@/lib/api/client';
import type { TxType } from '@/types';

/**
 * Chọn lại danh mục cho MỘT giao dịch — mở dạng sheet để chọn nhanh trên di động, đúng
 * thao tác lặp lại nhiều nhất của trang này: soát từng dòng "Chưa phân loại" rồi gán đúng.
 *
 * Chỉ liệt kê danh mục CÙNG CHIỀU tiền với giao dịch — BE cũng chặn lại nếu gửi sai chiều
 * (`layDanhMucHopLe`), nhưng chặn ở đây để user không chọn nhầm rồi mới thấy lỗi.
 */
export function CategoryPicker({
  open,
  onClose,
  type,
  currentId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  type: TxType;
  currentId?: string | null;
  onSelect: (categoryId: string) => void;
}) {
  const { data, isLoading, isError, error, refetch } = useCategories({ type });

  return (
    <Modal open={open} onClose={onClose} title="Chọn danh mục">
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : isError ? (
        <ErrorState message={(error as ApiError).message} onRetry={() => void refetch()} />
      ) : (
        <ul className="-mx-1 max-h-[60vh] space-y-0.5 overflow-y-auto">
          {data?.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(c.id);
                  onClose();
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
                  c.id === currentId ? 'bg-brand/10' : 'hover:bg-[var(--surface-2)]'
                }`}
              >
                <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                <span className="text-sm font-medium">{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
