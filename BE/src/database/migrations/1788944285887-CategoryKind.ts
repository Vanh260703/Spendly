import { MigrationInterface, QueryRunner } from "typeorm";

export class CategoryKind1788944285887 implements MigrationInterface {
    name = 'CategoryKind1788944285887'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."categories_kind_enum" AS ENUM('need', 'want', 'saving')`);
        // Cột mới NOT NULL DEFAULT 'need' — mọi danh mục ĐÃ CÓ đều nhận 'need' đầu tiên.
        // Đúng cho phần lớn (Ăn uống, Nhà ở, Lương...) nhưng SAI cho các danh mục vốn
        // thuộc want/saving (VD "Ăn vặt & cà phê", "Trả nợ") — nếu không backfill thì
        // khung 50/30/20 tính sai ngay từ ngày đầu bật tính năng, và AI sẽ đề xuất cắt
        // giảm nhầm chỗ (hoặc không đề xuất cắt đúng chỗ cần cắt).
        await queryRunner.query(`ALTER TABLE "categories" ADD "kind" "public"."categories_kind_enum" NOT NULL DEFAULT 'need'`);

        // Backfill theo TÊN, khớp đúng bảng gán trong `default-categories.ts`. Chỉ sửa
        // các danh mục mặc định (seed sẵn) — danh mục do user tự tạo không có gì để suy
        // ra ngoài 'need' mặc định, họ tự đổi qua UI nếu cần.
        await queryRunner.query(`
            UPDATE "categories" SET "kind" = 'want'
            WHERE "name" IN ('Ăn vặt & cà phê', 'Mua sắm', 'Giải trí', 'Mời bạn bè')
        `);
        await queryRunner.query(`
            UPDATE "categories" SET "kind" = 'saving'
            WHERE "name" = 'Trả nợ'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "kind"`);
        await queryRunner.query(`DROP TYPE "public"."categories_kind_enum"`);
    }

}
