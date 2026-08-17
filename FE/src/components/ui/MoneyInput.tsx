'use client';

import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { cn } from './index';

/** Bỏ mọi ký tự không phải chữ số — người dùng có thể dán "4.500.000₫" hoặc "4,500,000" */
const chiSo = (s: string) => s.replace(/\D/g, '');

const dinhDang = (digits: string) =>
  digits === '' ? '' : Number(digits).toLocaleString('vi-VN');

interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Giá trị số thật; `''` khi ô trống */
  value: number | '';
  onChange: (value: number | '') => void;
}

/**
 * Ô nhập tiền hiển thị dấu phân cách nghìn ngay khi gõ: `4500000` → `4.500.000`.
 *
 * Dùng `type="text"` chứ không phải `type="number"`, vì input number không hiển thị được
 * dấu chấm phân cách — mà "4500000" thì gần như không đọc nổi có mấy chữ số. Bù lại
 * `inputMode="numeric"` vẫn bật bàn phím số trên điện thoại.
 *
 * Giá trị truyền ra ngoài LUÔN là `number`, nên chỗ gọi không phải parse lại.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, className, ...rest },
  refNgoai,
) {
  const refTrong = useRef<HTMLInputElement>(null);
  const ref = (refNgoai as React.RefObject<HTMLInputElement>) ?? refTrong;

  /** Số chữ số nằm TRƯỚC con trỏ — mốc để đặt lại con trỏ sau khi format */
  const [soChuSoTruocCon, setSoChuSoTruocCon] = useState<number | null>(null);

  const hienThi = value === '' ? '' : dinhDang(String(value));

  /**
   * Đặt lại con trỏ sau khi React render lại.
   *
   * Không có bước này, con trỏ luôn nhảy về cuối mỗi lần format — sửa một chữ số ở giữa
   * số tiền sẽ trở thành cực hình. Đếm theo SỐ CHỮ SỐ chứ không theo vị trí ký tự, vì
   * dấu chấm được chèn thêm làm mọi vị trí lệch đi.
   */
  useLayoutEffect(() => {
    if (soChuSoTruocCon === null || !ref.current) return;

    let daDem = 0;
    let viTri = hienThi.length;
    for (let i = 0; i < hienThi.length; i++) {
      if (/\d/.test(hienThi[i])) daDem++;
      if (daDem === soChuSoTruocCon) {
        viTri = i + 1;
        break;
      }
    }
    if (soChuSoTruocCon === 0) viTri = 0;

    ref.current.setSelectionRange(viTri, viTri);
    setSoChuSoTruocCon(null);
  }, [hienThi, soChuSoTruocCon, ref]);

  const xuLy = (e: React.ChangeEvent<HTMLInputElement>) => {
    const con = e.target.selectionStart ?? e.target.value.length;
    setSoChuSoTruocCon(chiSo(e.target.value.slice(0, con)).length);

    const digits = chiSo(e.target.value);
    // Chặn 15 chữ số: vượt quá là ngoài giới hạn an toàn của Number
    onChange(digits === '' ? '' : Number(digits.slice(0, 15)));
  };

  return (
    <span className="relative block">
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={hienThi}
        onChange={xuLy}
        className={cn(
          'surface h-11 w-full rounded-xl pr-9 pl-3.5 text-right tabular outline-none transition focus:ring-2 focus:ring-brand/40',
          className,
        )}
        {...rest}
      />
      <span className="muted pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm">
        ₫
      </span>
    </span>
  );
});
