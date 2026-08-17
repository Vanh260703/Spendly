import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWallet1786589011852 implements MigrationInterface {
    name = 'AddWallet1786589011852'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "wallets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "name" character varying NOT NULL DEFAULT 'Ví chính', "initialBalance" bigint NOT NULL DEFAULT '0', "startedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_2ecdb33f23e9a6fc392025c0b97" UNIQUE ("userId"), CONSTRAINT "REL_2ecdb33f23e9a6fc392025c0b9" UNIQUE ("userId"), CONSTRAINT "PK_8402e5df5a30a229380e83e4f7e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "initialBalance"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "startedAt"`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "walletId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "wallets" ADD CONSTRAINT "FK_2ecdb33f23e9a6fc392025c0b97" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_a88f466d39796d3081cf96e1b66" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_a88f466d39796d3081cf96e1b66"`);
        await queryRunner.query(`ALTER TABLE "wallets" DROP CONSTRAINT "FK_2ecdb33f23e9a6fc392025c0b97"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "walletId"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "startedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "users" ADD "initialBalance" bigint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`DROP TABLE "wallets"`);
    }

}
