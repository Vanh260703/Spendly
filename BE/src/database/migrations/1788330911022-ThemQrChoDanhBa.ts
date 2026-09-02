import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm cột ảnh QR chuyển khoản cho từng người trong danh bạ.
 *
 * Lưu **data URI base64 thẳng trong DB**, không qua dịch vụ lưu ảnh ngoài: danh bạ chỉ vài
 * người, mỗi ảnh vài chục KB. Nằm trong DB thì ảnh tự đi theo `docker/backup.sh` — không có
 * chuyện khôi phục xong dữ liệu còn mà ảnh mất hết.
 *
 * ⚠️ Bản tự sinh của TypeORM còn kèm cả câu lệnh về `settlements`, vì DB local lúc đó chưa
 * chạy migration `TraNoKhongTaoGiaoDich`. Đã cắt bỏ — migration chỉ nên làm ĐÚNG việc mà tên
 * nó nói, chạy nhầm việc của migration khác là hỏng cả hai.
 */
export class ThemQrChoDanhBa1788330911022 implements MigrationInterface {
  name = 'ThemQrChoDanhBa1788330911022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contacts" ADD "qrImage" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "qrImage"`);
  }
}
