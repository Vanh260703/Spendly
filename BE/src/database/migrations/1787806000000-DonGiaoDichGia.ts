import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dọn những dòng `transactions` do APP tự sinh dưới mô hình cũ.
 *
 * Trước đây việc chia bill tách một giao dịch ngân hàng thành nhiều dòng con và ghi đè số
 * tiền của dòng gốc. Từ nay `transactions` là bản sao nguyên vẹn của sao kê, nên những dòng
 * đó không còn được phép tồn tại — chúng không khớp với bất cứ thứ gì bên ngân hàng.
 *
 * Nhận diện bằng `sepayId IS NULL`: mọi dòng đến từ SePay đều mang id của họ, còn dòng app
 * tự tạo thì không có.
 *
 * ⚠️ **Không khôi phục được số tiền đã bị ghi đè.** Dòng gốc bị thu nhỏ vẫn mang `sepayId`
 * nên migration này không đụng tới, nhưng số tiền của nó đã sai. Cách sửa: xóa dòng đó rồi
 * chạy đồng bộ lại — SePay trả về bản gốc, và khóa `(userId, sepayId)` lo phần chống trùng.
 */
export class DonGiaoDichGia1787806000000 implements MigrationInterface {
  name = 'DonGiaoDichGia1787806000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM transactions WHERE "sepayId" IS NULL`);
  }

  public async down(): Promise<void> {
    throw new Error('Không khôi phục được các dòng giao dịch giả đã xóa.');
  }
}
