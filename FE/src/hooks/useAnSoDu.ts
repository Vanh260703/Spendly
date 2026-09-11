'use client';

import { useSyncExternalStore } from 'react';

const KEY = 'spendly-an-so-du';
const nguoiNghe = new Set<() => void>();

function subscribe(cb: () => void) {
  nguoiNghe.add(cb);
  return () => nguoiNghe.delete(cb);
}

function getSnapshot() {
  return localStorage.getItem(KEY) === '1';
}

/** Không có `window` lúc build tĩnh — mặc định HIỆN, khớp với lần render đầu ở client */
function getServerSnapshot() {
  return false;
}

/**
 * Nhớ trạng thái ẩn/hiện số dư qua các lần mở app — cùng khóa localStorage với
 * `ThemeToggle` ở `AppShell`, chỉ khác tên.
 *
 * Dùng `useSyncExternalStore` thay vì `useState` + `useEffect` đọc localStorage: đọc trong
 * effect rồi `setState` là đúng loại mẫu hình `react-hooks/set-state-in-effect` cảnh báo
 * (gây thêm một lần render lại). `useSyncExternalStore` đọc "external state" (localStorage)
 * đúng cách — không mismatch giữa HTML build tĩnh và lần render đầu ở trình duyệt, không
 * cần effect.
 */
export function useAnSoDu() {
  const an = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const doi = () => {
    localStorage.setItem(KEY, an ? '0' : '1');
    nguoiNghe.forEach((l) => l());
  };
  return [an, doi] as const;
}
