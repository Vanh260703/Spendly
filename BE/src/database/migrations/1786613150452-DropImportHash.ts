import { MigrationInterface, QueryRunner } from "typeorm";

export class DropImportHash1786613150452 implements MigrationInterface {
    name = 'DropImportHash1786613150452'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "UQ_2b262bca16b7cc1d9c6a2ae06cb"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "importHash"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" ADD "importHash" character varying`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "UQ_2b262bca16b7cc1d9c6a2ae06cb" UNIQUE ("userId", "importHash")`);
    }

}
