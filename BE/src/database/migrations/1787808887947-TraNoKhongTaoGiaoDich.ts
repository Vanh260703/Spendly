import { MigrationInterface, QueryRunner } from "typeorm";

export class TraNoKhongTaoGiaoDich1787808887947 implements MigrationInterface {
    name = 'TraNoKhongTaoGiaoDich1787808887947'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settlements" DROP CONSTRAINT "FK_9b8c3189c50af09ea64dc7301d6"`);
        await queryRunner.query(`ALTER TABLE "settlements" DROP COLUMN "transactionId"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settlements" ADD "transactionId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD CONSTRAINT "FK_9b8c3189c50af09ea64dc7301d6" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

}
