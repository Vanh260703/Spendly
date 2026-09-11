'use client';

import { useQuery } from '@tanstack/react-query';
import { aiApi } from '@/lib/api';

/**
 * CHỈ ĐỌC bản do cron sinh — không gọi AI.
 *
 * `GET /ai/insights` chỉ truy DB nên luôn nhanh, miễn phí và không bao giờ đẻ thêm bản
 * ghi. Bản phân tích do `AiScheduler` sinh 08:00 sáng mỗi ngày cho tuần vừa khép lại.
 *
 * ⚠️ Đừng đổi sang gọi `aiApi.necessityReview()`/`aiApi.report()`/`aiApi.healthScore()`
 * ở đây: những hàm đó SINH bản mới cho kỳ ĐANG chạy, tức mở trang là tốn quota và đẩy vào
 * kho một bản dựng từ dữ liệu vài ngày (xem `AiScheduler`).
 */
export const useNecessityReview = () =>
  useQuery({
    queryKey: ['ai', 'insights', 'necessity'],
    queryFn: async () => (await aiApi.insights({ kind: 'necessity', limit: 1 }))[0] ?? null,
  });

/**
 * Điểm sức khỏe tài chính — SINH trực tiếp, khác `useNecessityReview` ở trên.
 *
 * `AiScheduler` không sinh sẵn điểm này theo cron (chỉ có weekly/monthly/necessity trong
 * `VIEC_DINH_KY`) vì đây là một số tính TỪ dữ liệu tháng hiện tại, không phải báo cáo của
 * một kỳ đã khép — mở trang lúc nào cũng hợp lệ để xem. Cache `inputHash` ở BE vẫn chặn gọi
 * LLM trùng khi dữ liệu tháng chưa đổi.
 */
export const useHealthScore = () =>
  useQuery({
    queryKey: ['ai', 'health-score'],
    queryFn: aiApi.healthScore,
    retry: false,
  });

/** Kho báo cáo tuần/tháng đã sinh — trang `/reports` */
export const useReports = () =>
  useQuery({
    queryKey: ['ai', 'insights', 'reports'],
    queryFn: () => aiApi.insights({ kinds: 'weekly,monthly', limit: 50 }),
  });
