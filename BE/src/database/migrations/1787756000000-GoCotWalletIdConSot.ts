import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gỡ cột `walletId` còn sót lại trên `transactions`.
 *
 * Migration `NghiepVuNganHang` chuyển dữ liệu sang `bankAccountId` nhưng **quên xóa cột cũ**
 * — lúc sửa migration tay đã bỏ nhầm câu `DROP COLUMN`. Cột thừa không làm sai số liệu,
 * nhưng nó vẫn `NOT NULL` nên MỌI câu `INSERT INTO transactions` không khai `walletId` đều
 * chết, kể cả khi entity không còn biết cột đó tồn tại.
 */
export class GoCotWalletIdConSot1787756000000 implements MigrationInterface {
  name = 'GoCotWalletIdConSot1787756000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS "walletId"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Không khôi phục được dữ liệu cột cũ (bảng `wallets` đã bị xóa), nên chỉ dựng lại
    // cột rỗng cho phép NULL để migration đảo chiều không chết giữa chừng.
    await queryRunner.query(`ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "walletId" uuid`);
  }
}
