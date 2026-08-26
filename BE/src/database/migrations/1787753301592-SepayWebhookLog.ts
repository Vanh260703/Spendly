import { MigrationInterface, QueryRunner } from "typeorm";

export class SepayWebhookLog1787753301592 implements MigrationInterface {
    name = 'SepayWebhookLog1787753301592'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_share_moi_nguoi_mot_phan"`);
        await queryRunner.query(`CREATE TABLE "sepay_webhook_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "body" jsonb NOT NULL, "headers" jsonb NOT NULL, "ip" character varying, "apiKeyOk" boolean, CONSTRAINT "PK_8908a50c91b2365fac037b45ffe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_67b9338ad2f8cd3f90057aa017" ON "sepay_webhook_logs" ("createdAt") `);
        await queryRunner.query(`ALTER TABLE "shared_expense_shares" ADD CONSTRAINT "UQ_13ff5d45714ec3f31a72695e828" UNIQUE ("sharedExpenseId", "contactId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "shared_expense_shares" DROP CONSTRAINT "UQ_13ff5d45714ec3f31a72695e828"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_67b9338ad2f8cd3f90057aa017"`);
        await queryRunner.query(`DROP TABLE "sepay_webhook_logs"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_share_moi_nguoi_mot_phan" ON "shared_expense_shares" ("contactId", "sharedExpenseId") `);
    }

}
