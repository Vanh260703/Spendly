import { MigrationInterface, QueryRunner } from "typeorm";

export class ThemCoDaXet1787802137547 implements MigrationInterface {
    name = 'ThemCoDaXet1787802137547'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" ADD "reviewedAt" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "reviewedAt"`);
    }

}
