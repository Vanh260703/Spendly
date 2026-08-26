import { MigrationInterface, QueryRunner } from "typeorm";

export class NghiepVuNganHang1787755115928 implements MigrationInterface {
    name = 'NghiepVuNganHang1787755115928'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_a88f466d39796d3081cf96e1b66"`);
        await queryRunner.query(`CREATE TABLE "bank_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "accountNumber" character varying NOT NULL, "bankName" character varying NOT NULL, "nickname" character varying NOT NULL DEFAULT 'Tài khoản chính', "currentBalance" bigint NOT NULL DEFAULT '0', "lastSyncedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_78237756b3dad116a3f5f6398ef" UNIQUE ("accountNumber"), CONSTRAINT "PK_c872de764f2038224a013ff25ed" PRIMARY KEY ("id"))`);

        /*
         * ─── CHUYỂN DỮ LIỆU CŨ ───
         *
         * Giao dịch cũ đang trỏ vào `wallets`. Đổi thẳng sang `bankAccountId NOT NULL` sẽ
         * chết vì các dòng có sẵn không có giá trị. Nên: dựng cho mỗi ví một tài khoản
         * ngân hàng TẠM, chuyển giao dịch sang, rồi mới siết ràng buộc.
         *
         * `accountNumber` tạm mang tiền tố `CHUA-LIEN-KET-` để không bao giờ khớp số tài
         * khoản thật SePay gửi về — webhook sẽ không đổ nhầm giao dịch vào đây.
         *
         * Số dư tạm = công thức CŨ (`initialBalance + Σthu − Σchi`). Nó sẽ bị webhook đầu
         * tiên ghi đè bằng `accumulated` thật, nên chỉ cần đúng ở thời điểm chuyển đổi.
         */
        await queryRunner.query(`
          INSERT INTO bank_accounts ("userId", "accountNumber", "bankName", nickname, "currentBalance")
          SELECT w."userId",
                 'CHUA-LIEN-KET-' || left(w."userId"::text, 8),
                 '(chưa liên kết)',
                 COALESCE(w.name, 'Tài khoản chính'),
                 w."initialBalance"
                   + COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
                               FROM transactions t WHERE t."userId" = w."userId"), 0)
          FROM wallets w
        `);

        await queryRunner.query(`ALTER TABLE "transactions" ADD "bankAccountId" uuid`);
        await queryRunner.query(`
          UPDATE transactions t
          SET "bankAccountId" = b.id
          FROM bank_accounts b
          WHERE b."userId" = t."userId"
        `);
        // Giao dịch mồ côi (user không có ví) không thể quy về đâu — xóa, nếu không câu
        // SET NOT NULL bên dưới sẽ chết
        await queryRunner.query(`DELETE FROM transactions WHERE "bankAccountId" IS NULL`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "bankAccountId" SET NOT NULL`);

        /*
         * ─── GỠ CÁC BẢNG CỦA MODULE ĐÃ XÓA ───
         * TypeORM không tự sinh những câu này: entity đã bị xóa khỏi mã nguồn nên nó không
         * còn biết các bảng đó từng tồn tại. Thứ tự theo chiều khóa ngoại.
         */
        await queryRunner.query(`DROP TABLE IF EXISTS "chat_messages" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_insights" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "budget_period_results" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "budgets" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "goal_contributions" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "goals" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "debt_payments" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "debts" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "wallets" CASCADE`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."ai_insights_kind_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."chat_messages_role_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."budgets_period_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."goals_horizon_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."goals_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."debts_strategy_enum"`);

        /*
         * ─── DANH MỤC MỚI: "Chưa phân loại" ───
         * Giao dịch từ ngân hàng không kèm danh mục nên phải có chỗ hứng. Backfill cho tài
         * khoản đã tồn tại; seed lúc đăng ký chỉ lo cho user mới.
         */
        for (const c of [
            `('Chưa phân loại', 'expense', 'circle-help', '#94a3b8')`,
            `('Chưa phân loại', 'income',  'circle-help', '#94a3b8')`,
        ]) {
            await queryRunner.query(`
              INSERT INTO categories ("userId", name, type, icon, color, "isSystem")
              SELECT u.id, v.name, v.type::categories_type_enum, v.icon, v.color, true
              FROM users u
              CROSS JOIN (VALUES ${c}) AS v(name, type, icon, color)
              WHERE NOT EXISTS (
                SELECT 1 FROM categories c2
                WHERE c2."userId" = u.id AND c2.name = v.name
                  AND c2.type = v.type::categories_type_enum
              )
            `);
        }

        // Danh mục "Điều chỉnh số dư" mất lý do tồn tại: số dư giờ do ngân hàng cấp,
        // không còn gì để điều chỉnh tay
        await queryRunner.query(`DELETE FROM categories WHERE name = 'Điều chỉnh số dư'`);
        await queryRunner.query(`CREATE INDEX "IDX_45ef3ca170943e2c70e8073a7c" ON "bank_accounts" ("userId") `);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "monthlyIncome"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "kind"`);
        await queryRunner.query(`DROP TYPE "public"."categories_kind_enum"`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "sepayId" integer`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "referenceCode" character varying`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "UQ_ab3a2e8780bf83dedaaf7441838" UNIQUE ("userId", "sepayId")`);
        await queryRunner.query(`ALTER TABLE "bank_accounts" ADD CONSTRAINT "FK_45ef3ca170943e2c70e8073a7c5" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_dd5f9a2ef07b89d35aeb480f376" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_dd5f9a2ef07b89d35aeb480f376"`);
        await queryRunner.query(`ALTER TABLE "bank_accounts" DROP CONSTRAINT "FK_45ef3ca170943e2c70e8073a7c5"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "UQ_ab3a2e8780bf83dedaaf7441838"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "referenceCode"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "sepayId"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "bankAccountId"`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "walletId" uuid NOT NULL`);
        await queryRunner.query(`CREATE TYPE "public"."categories_kind_enum" AS ENUM('need', 'want', 'saving')`);
        await queryRunner.query(`ALTER TABLE "categories" ADD "kind" "public"."categories_kind_enum" NOT NULL DEFAULT 'need'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "monthlyIncome" bigint`);
        await queryRunner.query(`DROP INDEX "public"."IDX_45ef3ca170943e2c70e8073a7c"`);
        await queryRunner.query(`DROP TABLE "bank_accounts"`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_a88f466d39796d3081cf96e1b66" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
