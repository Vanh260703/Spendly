import { MigrationInterface, QueryRunner } from "typeorm";

export class CongNoBanBe1786955912674 implements MigrationInterface {
    name = 'CongNoBanBe1786955912674'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "contacts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "name" character varying NOT NULL, "nameNormalized" character varying NOT NULL, "phone" character varying, "note" character varying, "color" character varying NOT NULL DEFAULT '#64748b', "isArchived" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_a13cdf6b5fde1ec4322fef0a919" UNIQUE ("userId", "nameNormalized"), CONSTRAINT "PK_b99cd40cfd66a99f1571f4f72e6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_bc304fb5eb4688ef93e6905b8a" ON "contacts" ("userId", "isArchived") `);
        await queryRunner.query(`CREATE TABLE "shared_expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "payerContactId" uuid, "totalAmount" bigint NOT NULL, "date" TIMESTAMP WITH TIME ZONE NOT NULL, "note" character varying, "categoryId" uuid NOT NULL, "treatAmount" bigint NOT NULL DEFAULT '0', "treatCategoryId" uuid, "transactionIdMine" uuid, "transactionIdTreat" uuid, "transactionIdLent" uuid, CONSTRAINT "PK_9578cc57b8e1eb8e2e3ef5f9f1d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d5e1717201b7e879ab718b23fe" ON "shared_expenses" ("userId", "date") `);
        await queryRunner.query(`CREATE TABLE "shared_expense_shares" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "sharedExpenseId" uuid NOT NULL, "contactId" uuid, "amount" bigint NOT NULL, CONSTRAINT "UQ_13ff5d45714ec3f31a72695e828" UNIQUE ("sharedExpenseId", "contactId"), CONSTRAINT "PK_8ef81ea95b3f90005427a7b176e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."settlements_direction_enum" AS ENUM('they_paid_me', 'i_paid_them')`);
        await queryRunner.query(`CREATE TABLE "settlements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "contactId" uuid NOT NULL, "direction" "public"."settlements_direction_enum" NOT NULL, "amount" bigint NOT NULL, "date" TIMESTAMP WITH TIME ZONE NOT NULL, "note" character varying, "transactionId" uuid NOT NULL, CONSTRAINT "PK_5f523ce152b84e818bff9467aab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_933d2330b758becd6dd756c8e3" ON "settlements" ("userId", "contactId", "date") `);
        await queryRunner.query(`ALTER TABLE "contacts" ADD CONSTRAINT "FK_30ef77942fc8c05fcb829dcc61d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD CONSTRAINT "FK_d468af8b4f76296c17226f99ba9" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD CONSTRAINT "FK_cb23206b64bb1f59ab2735ae056" FOREIGN KEY ("payerContactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD CONSTRAINT "FK_7050d4a849ec8c706dfd58fee36" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD CONSTRAINT "FK_732f66718fadb76ddad47535994" FOREIGN KEY ("treatCategoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD CONSTRAINT "FK_4f38294a6d18edfd5a0dbe2a7f6" FOREIGN KEY ("transactionIdMine") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD CONSTRAINT "FK_fb9129b9e0ceb5c2684016b66c9" FOREIGN KEY ("transactionIdTreat") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD CONSTRAINT "FK_e3ad553dad831ff88dff8c32e80" FOREIGN KEY ("transactionIdLent") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shared_expense_shares" ADD CONSTRAINT "FK_09e0610c11d6e7662427335315d" FOREIGN KEY ("sharedExpenseId") REFERENCES "shared_expenses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shared_expense_shares" ADD CONSTRAINT "FK_d9353550a54bbec88de5bc4dbb8" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD CONSTRAINT "FK_4ff643af81bd6ae92eaaabdd2f4" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD CONSTRAINT "FK_13af4b82bb74faaedadf0215bf7" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD CONSTRAINT "FK_9b8c3189c50af09ea64dc7301d6" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);

        /*
         * ⚠️ `UNIQUE ("sharedExpenseId", "contactId")` KHÔNG chặn được phần của CHÍNH BẠN.
         *
         * Trong Postgres, hai NULL không coi là trùng nhau, mà phần của bạn lưu bằng
         * `contactId = NULL` — nên một hóa đơn có thể có nhiều dòng "phần của tôi" và tổng
         * các phần vẫn khớp, không ai phát hiện ra. `NULLS NOT DISTINCT` (PG 15+) sửa đúng
         * chỗ đó.
         */
        await queryRunner.query(`ALTER TABLE "shared_expense_shares" DROP CONSTRAINT "UQ_13ff5d45714ec3f31a72695e828"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_share_moi_nguoi_mot_phan" ON "shared_expense_shares" ("sharedExpenseId", "contactId") NULLS NOT DISTINCT`);

        /*
         * BACKFILL — tài khoản đã tồn tại cũng phải có 3 danh mục mới, nếu không tính năng
         * công nợ sẽ ném 404 "không tìm thấy danh mục hệ thống" ngay lần dùng đầu tiên.
         * Seed lúc đăng ký chỉ lo cho user MỚI.
         *
         * `WHERE NOT EXISTS` để chạy lại migration trên DB đã backfill cũng không nhân đôi.
         */
        for (const c of [
            `('Mời bạn bè',    'expense', 'want', 'gift',  '#f43f5e', false)`,
            `('Trả hộ bạn bè', 'income',  'need', 'users', '#94a3b8', true)`,
            `('Trả hộ bạn bè', 'expense', 'need', 'users', '#94a3b8', true)`,
        ]) {
            // Giá trị nội suy thẳng chứ không dùng tham số: `$n` đứng cạnh cast enum khiến
            // Postgres không suy được kiểu (`variable_coerce_param_hook`). Đây là hằng số
            // trong mã nguồn, không phải dữ liệu người dùng.
            await queryRunner.query(
                `INSERT INTO categories ("userId", name, type, kind, icon, color, "isSystem")
                 SELECT u.id, v.name, v.type::categories_type_enum, v.kind::categories_kind_enum,
                        v.icon, v.color, v."isSystem"
                 FROM users u
                 CROSS JOIN (VALUES ${c}) AS v(name, type, kind, icon, color, "isSystem")
                 WHERE NOT EXISTS (
                   SELECT 1 FROM categories c
                   WHERE c."userId" = u.id AND c.name = v.name
                     AND c.type = v.type::categories_type_enum
                 )`,
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM categories WHERE name IN ('Mời bạn bè', 'Trả hộ bạn bè')`);
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_share_moi_nguoi_mot_phan"`);
        await queryRunner.query(`ALTER TABLE "settlements" DROP CONSTRAINT "FK_9b8c3189c50af09ea64dc7301d6"`);
        await queryRunner.query(`ALTER TABLE "settlements" DROP CONSTRAINT "FK_13af4b82bb74faaedadf0215bf7"`);
        await queryRunner.query(`ALTER TABLE "settlements" DROP CONSTRAINT "FK_4ff643af81bd6ae92eaaabdd2f4"`);
        await queryRunner.query(`ALTER TABLE "shared_expense_shares" DROP CONSTRAINT "FK_d9353550a54bbec88de5bc4dbb8"`);
        await queryRunner.query(`ALTER TABLE "shared_expense_shares" DROP CONSTRAINT "FK_09e0610c11d6e7662427335315d"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP CONSTRAINT "FK_e3ad553dad831ff88dff8c32e80"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP CONSTRAINT "FK_fb9129b9e0ceb5c2684016b66c9"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP CONSTRAINT "FK_4f38294a6d18edfd5a0dbe2a7f6"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP CONSTRAINT "FK_732f66718fadb76ddad47535994"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP CONSTRAINT "FK_7050d4a849ec8c706dfd58fee36"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP CONSTRAINT "FK_cb23206b64bb1f59ab2735ae056"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP CONSTRAINT "FK_d468af8b4f76296c17226f99ba9"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP CONSTRAINT "FK_30ef77942fc8c05fcb829dcc61d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_933d2330b758becd6dd756c8e3"`);
        await queryRunner.query(`DROP TABLE "settlements"`);
        await queryRunner.query(`DROP TYPE "public"."settlements_direction_enum"`);
        await queryRunner.query(`DROP TABLE "shared_expense_shares"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d5e1717201b7e879ab718b23fe"`);
        await queryRunner.query(`DROP TABLE "shared_expenses"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bc304fb5eb4688ef93e6905b8a"`);
        await queryRunner.query(`DROP TABLE "contacts"`);
    }

}
