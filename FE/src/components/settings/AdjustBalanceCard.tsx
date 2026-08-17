'use client';

import { Scale } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, CardTitle, Field, MoneyInput } from '@/components/ui';
import { useAdjustBalance, useBalance } from '@/hooks/useFinance';
import { formatMoney } from '@/lib/format';

/**
 * Điều chỉnh số dư — dùng khi quên nhập vài khoản khiến số app tính lệch tiền thật.
 *
 * Khác hẳn với sửa "số dư ban đầu": cái đó **dịch chuyển toàn bộ lịch sử** (mọi kỳ quá khứ
 * đều đổi số), còn cái này chỉ tạo một giao dịch bù **tại hôm nay** nên báo cáo các kỳ
 * trước giữ nguyên. Sai sót xảy ra ở thời điểm nào thì sửa ở thời điểm đó.
 */
export function AdjustBalanceCard() {
  const { data: balance } = useBalance();
  const dieuChinh = useAdjustBalance();
  const [thucTe, setThucTe] = useState<number | ''>('');

  const dangTinh = balance?.currentBalance ?? 0;
  const chenh = thucTe === '' ? null : Number(thucTe) - dangTinh;

  return (
    <Card>
      <CardTitle>
        <span className="flex items-center gap-2">
          <Scale size={18} /> Điều chỉnh số dư
        </span>
      </CardTitle>

      <p className="muted mb-3 text-sm">
        Đếm lại tiền thật rồi khai vào đây. App sẽ tạo một giao dịch bù đúng phần chênh lệch,
        và loại nó khỏi mọi thống kê để không làm nhiễu phân tích.
      </p>

      <div className="mb-3 flex items-center justify-between rounded-xl bg-[var(--surface-2)] px-3 py-2.5 text-sm">
        <span className="muted">App đang tính</span>
        <span className="tabular font-semibold">{formatMoney(dangTinh)}</span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          dieuChinh.mutate(
            { actualBalance: Number(thucTe) },
            { onSuccess: () => setThucTe('') },
          );
        }}
        className="space-y-3"
      >
        <Field label="Số tiền thực tế bạn đang có">
          <MoneyInput
            value={thucTe}
            onChange={setThucTe}
            placeholder={dangTinh.toLocaleString('vi-VN')}
            required
            className="text-lg font-semibold"
          />
        </Field>

        {chenh !== null && chenh !== 0 && (
          <p className={`text-sm ${chenh > 0 ? 'text-income' : 'text-expense'}`}>
            Chênh {formatMoney(chenh, { sign: true })} — sẽ tạo một khoản{' '}
            {chenh > 0 ? 'thu' : 'chi'} bù vào hôm nay
          </p>
        )}

        {chenh === 0 && <p className="muted text-sm">Số dư đã khớp, không cần điều chỉnh</p>}

        <Button
          type="submit"
          variant="secondary"
          loading={dieuChinh.isPending}
          disabled={chenh === 0}
          className="w-full"
        >
          Điều chỉnh
        </Button>
      </form>
    </Card>
  );
}
