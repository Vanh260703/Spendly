'use client';

import { Download, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { QuickAddForm } from '@/components/transactions/QuickAddForm';
import { TransactionList } from '@/components/transactions/TransactionList';
import { Button, Card, Input, Modal, Select } from '@/components/ui';
import { useCategories } from '@/hooks/useFinance';
import { API_URL } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

export default function TransactionsPage() {
  const [moForm, setMoForm] = useState(false);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const { data: categories } = useCategories(type ? { type } : {});

  /**
   * Tải file phải tự fetch kèm Bearer token rồi tạo blob — thẻ <a download> thường
   * không gửi được header Authorization nên sẽ nhận 401.
   */
  const taiFile = async () => {
    const res = await fetch(`${API_URL}/export/excel`, {
      headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken}` },
      credentials: 'include',
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spendly-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Giao dịch</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void taiFile()}>
            <Download size={18} /> Xuất CSV
          </Button>
          <Button onClick={() => setMoForm(true)}>
            <Plus size={18} /> Ghi khoản
          </Button>
        </div>
      </div>

      <Card className="space-y-3">
        <div className="relative">
          <Search size={16} className="muted absolute top-1/2 left-3 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm trong ghi chú..."
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setCategoryId('');
            }}
          >
            <option value="">Tất cả loại</option>
            <option value="expense">Khoản chi</option>
            <option value="income">Khoản thu</option>
          </Select>

          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Tất cả danh mục</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <TransactionList filters={{ q: q || undefined, type: type || undefined, categoryId: categoryId || undefined }} />

      <Modal open={moForm} onClose={() => setMoForm(false)} title="Ghi khoản thu chi">
        <QuickAddForm onDone={() => setMoForm(false)} />
      </Modal>
    </div>
  );
}
