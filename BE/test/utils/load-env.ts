/**
 * Nạp `.env.test` TRƯỚC khi bất kỳ module nào được import.
 *
 * Bắt buộc phải chạy ở `setupFiles` (không phải `setupFilesAfterEnv`): `data-source.ts`
 * đọc `process.env` ngay lúc import, nạp muộn là test sẽ chạy vào DB dev thay vì DB test.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../.env.test'), override: true });
