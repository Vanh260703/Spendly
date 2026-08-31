import { MigrationInterface, QueryRunner } from "typeorm";

export class CongNoKhongDungTransaction1787804208122 implements MigrationInterface {
    name = 'CongNoKhongDungTransaction1787804208122'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP CONSTRAINT "FK_7050d4a849ec8c706dfd58fee36"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP CONSTRAINT "FK_732f66718fadb76ddad47535994"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP CONSTRAINT "FK_4f38294a6d18edfd5a0dbe2a7f6"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP CONSTRAINT "FK_fb9129b9e0ceb5c2684016b66c9"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP CONSTRAINT "FK_e3ad553dad831ff88dff8c32e80"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP COLUMN "categoryId"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP COLUMN "treatAmount"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP COLUMN "treatCategoryId"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP COLUMN "transactionIdMine"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP COLUMN "transactionIdTreat"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP COLUMN "transactionIdLent"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD "transactionId" uuid`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD CONSTRAINT "UQ_b0baf37dab319a80e6c06704567" UNIQUE ("transactionId")`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD CONSTRAINT "FK_b0baf37dab319a80e6c06704567" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP CONSTRAINT "FK_b0baf37dab319a80e6c06704567"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP CONSTRAINT "UQ_b0baf37dab319a80e6c06704567"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" DROP COLUMN "transactionId"`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD "transactionIdLent" uuid`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD "transactionIdTreat" uuid`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD "transactionIdMine" uuid`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD "treatCategoryId" uuid`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD "treatAmount" bigint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD "categoryId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD CONSTRAINT "FK_e3ad553dad831ff88dff8c32e80" FOREIGN KEY ("transactionIdLent") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD CONSTRAINT "FK_fb9129b9e0ceb5c2684016b66c9" FOREIGN KEY ("transactionIdTreat") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD CONSTRAINT "FK_4f38294a6d18edfd5a0dbe2a7f6" FOREIGN KEY ("transactionIdMine") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD CONSTRAINT "FK_732f66718fadb76ddad47535994" FOREIGN KEY ("treatCategoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shared_expenses" ADD CONSTRAINT "FK_7050d4a849ec8c706dfd58fee36" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

}
