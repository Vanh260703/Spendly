'use client';

import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CategoryForm } from '@/components/categories/CategoryForm';
import {
  Button, Card, CardTitle, CategoryIcon, ErrorState, Modal, Skeleton, cn,
} from '@/components/ui';
import { useCategories, useDeleteCategory } from '@/hooks/useFinance';
import type { Category, TxType } from '@/types';

const KIND_BADGE = {
  need: { nhan: 'Cần thiết', lop: 'bg-blue-500/15 text-blue-500' },
  want: { nhan: 'Mong muốn', lop: 'bg-warning/15 text-warning' },
  saving: { nhan: 'Tiết kiệm', lop: 'bg-ok/15 text-ok' },
} as const;

export default function CategoriesPage() {
  const { data, isLoading, isError, error, refetch } = useCategories();
  const xoa = useDeleteCategory();

  const [mo, setMo] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [loaiMoi, setLoaiMoi] = useState<TxType>('expense');

  const dong = () => {
    setMo(false);
    setEditing(null);
  };

  const moTao = (type: TxType) => {
    setEditing(null);
    setLoaiMoi(type);
    setMo(true);
  };

  const nhom = (type: TxType) => (data ?? []).filter((c) => c.type === type);

  const xoaDanhMuc = (c: Category) => {
    if (
      confirm(
        `Xóa danh mục "${c.name}"?\n\nGiao dịch cũ KHÔNG bị xóa — chúng sẽ được chuyển sang danh mục "Khác".`,
      )
    ) {
      xoa.mutate(c.id);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Danh mục</h1>

      <p className="muted text-sm">
        Phân loại <strong>Cần thiết / Mong muốn / Tiết kiệm</strong> quyết định trợ lý AI được
        phép đề xuất cắt giảm ở đâu — nó chỉ đụng vào nhóm &ldquo;Mong muốn&rdquo;.
      </p>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : isError ? (
        <Card>
          <ErrorState message={(error as Error)?.message} onRetry={() => void refetch()} />
        </Card>
      ) : (
        (['expense', 'income'] as const).map((type) => (
          <Card key={type}>
            <CardTitle
              action={
                <Button variant="ghost" size="sm" onClick={() => moTao(type)}>
                  <Plus size={16} /> Thêm
                </Button>
              }
            >
              {type === 'expense' ? 'Khoản chi' : 'Khoản thu'}
              <span className="muted ml-2 text-sm font-normal">({nhom(type).length})</span>
            </CardTitle>

            <ul className="divide-y">
              {nhom(type).map((c) => (
                <li key={c.id} className="group flex items-center gap-3 py-2.5">
                  <CategoryIcon icon={c.icon} color={c.color} />

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{c.name}</span>
                      {/* Danh mục "Khác" là nơi hứng giao dịch khi xóa danh mục khác */}
                      {c.isDefault && (
                        <Lock size={12} className="muted shrink-0" aria-label="Không thể xóa" />
                      )}
                    </span>
                    {type === 'expense' && (
                      <span
                        className={cn(
                          'mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                          KIND_BADGE[c.kind].lop,
                        )}
                      >
                        {KIND_BADGE[c.kind].nhan}
                      </span>
                    )}
                  </span>

                  <span className="flex shrink-0 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(c);
                        setMo(true);
                      }}
                      aria-label={`Sửa ${c.name}`}
                    >
                      <Pencil size={15} />
                    </Button>

                    {!c.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => xoaDanhMuc(c)}
                        aria-label={`Xóa ${c.name}`}
                      >
                        <Trash2 size={15} className="text-expense" />
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}

      <Modal
        open={mo}
        onClose={dong}
        title={editing ? `Sửa "${editing.name}"` : 'Thêm danh mục'}
      >
        <CategoryForm editing={editing} defaultType={loaiMoi} onDone={dong} />
      </Modal>
    </div>
  );
}
