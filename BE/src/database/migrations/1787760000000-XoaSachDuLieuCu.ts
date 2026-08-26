import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * XÓA SẠCH dữ liệu cũ — giữ nguyên schema.
 *
 * Dữ liệu tích lại từ hai nguồn đều đã hết giá trị:
 * - **Mô hình cũ**: giao dịch nhập tay, ví `CHUA-LIEN-KET-*` do migration `NghiepVuNganHang`
 *   dựng tạm. Số dư của chúng tính theo công thức cũ (`initialBalance + Σthu − Σchi`) nên
 *   không còn ý nghĩa khi số dư giờ do ngân hàng cấp.
 * - **Rác test**: mỗi lần chạy smoke test lại đẻ một user kèm 22 danh mục.
 *
 * Sau migration, `SingleUserService` tự tạo lại một user kèm bộ danh mục mặc định ở lần
 * khởi động kế tiếp. App trống hoàn toàn, chờ webhook SePay đầu tiên.
 *
 * ⚠️ **KHÔNG hoàn tác được.** `down()` cố ý bỏ trống: viết một hàm "khôi phục" không thể
 * khôi phục gì là tệ hơn không viết — nó tạo cảm giác an toàn giả. Muốn lùi lại thì dùng
 * `sh docker/restore.sh <bản backup>`.
 *
 * ⚠️ Phải **khởi động lại BE** sau khi chạy: `SingleUserService` cache id của user trong bộ
 * nhớ, mà user đó vừa bị xóa. Không restart thì mọi request đều lỗi khóa ngoại.
 */
export class XoaSachDuLieuCu1787760000000 implements MigrationInterface {
  name = 'XoaSachDuLieuCu1787760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
     * Một câu TRUNCATE cho tất cả, kèm CASCADE.
     *
     * Xóa từng bảng bằng DELETE sẽ phải tự sắp đúng thứ tự khóa ngoại, và sai thứ tự thì
     * dừng giữa chừng để lại dữ liệu nửa vời. TRUNCATE nhiều bảng trong MỘT câu thì Postgres
     * lo phần phụ thuộc, và hoặc xong hết hoặc không đụng gì.
     *
     * `migrations` KHÔNG nằm trong danh sách — xóa nó là Postgres chạy lại toàn bộ migration
     * từ đầu ở lần khởi động sau.
     */
    await queryRunner.query(`
      TRUNCATE TABLE
        settlements,
        shared_expense_shares,
        shared_expenses,
        contacts,
        transactions,
        bank_accounts,
        categories,
        sepay_webhook_logs,
        users
      RESTART IDENTITY CASCADE
    `);
  }

  public async down(): Promise<void> {
    throw new Error(
      'Không thể hoàn tác việc xóa dữ liệu. Dùng `sh docker/restore.sh <file backup>`.',
    );
  }
}
