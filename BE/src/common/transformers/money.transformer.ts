import { ValueTransformer } from 'typeorm';

/**
 * Cầu nối cho MỌI cột tiền: DB là `bigint` (đơn vị đồng), tầng TS là `number`.
 *
 * Vì sao cần: driver `pg` luôn trả cột `bigint` về JS dưới dạng CHUỖI để tránh mất chính xác.
 * Không có transformer này thì `wallet.balance + 5000` sẽ ra `"170000005000"` (nối chuỗi) chứ
 * không phải phép cộng — một lỗi im lặng và rất khó truy.
 *
 * Giới hạn an toàn của `number` là 9.007.199.254.740.991 đồng (~9 triệu tỷ), thực tế không
 * bao giờ chạm tới. Cột DB vẫn là `bigint` nên nếu sau này cần đổi sang `BigInt`/`string`
 * thì chỉ sửa file này, KHÔNG phải migrate schema.
 *
 * ⚠️ Bắt buộc gắn vào mọi cột tiền: `@Column({ type: 'bigint', transformer: money })`
 */
export const money: ValueTransformer = {
  /** JS → DB. `Math.round` chặn số lẻ lọt xuống (Postgres `bigint` sẽ lỗi với 12000000.5). */
  to: (value?: number | null): string | null | undefined =>
    value === null || value === undefined ? value : Math.round(value).toString(),

  /** DB → JS */
  from: (value?: string | null): number | null | undefined =>
    value === null || value === undefined ? value : Number(value),
};
