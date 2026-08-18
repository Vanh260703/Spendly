import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContactQrImage1787021843000 implements MigrationInterface {
  name = 'ContactQrImage1787021843000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contacts" ADD "qrImage" text`);
    await queryRunner.query(`ALTER TABLE "contacts" ADD "qrImagePublicId" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "qrImagePublicId"`);
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "qrImage"`);
  }
}
