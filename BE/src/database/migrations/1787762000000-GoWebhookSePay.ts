import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gỡ bảng `sepay_webhook_logs` — app chuyển sang **KÉO** giao dịch thay vì chờ SePay đẩy.
 *
 * Bảng này sinh ra để lưu nguyên văn payload webhook làm bằng chứng. Không còn webhook thì
 * nó không còn được ghi vào, và giữ một bảng chết chỉ làm người đọc schema sau này bối rối.
 *
 * Dấu vết đối chiếu vẫn còn nguyên trên chính `transactions`: `sepayId` và `referenceCode`
 * — đủ để tra ngược lên SePay hoặc sao kê ngân hàng khi có tranh chấp.
 */
export class GoWebhookSePay1787762000000 implements MigrationInterface {
  name = 'GoWebhookSePay1787762000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sepay_webhook_logs" CASCADE`);
  }

  public async down(): Promise<void> {
    throw new Error(
      'Không khôi phục được log webhook đã xóa. Dùng `sh docker/restore.sh <file backup>`.',
    );
  }
}
