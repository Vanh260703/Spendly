import { MigrationInterface, QueryRunner } from "typeorm";

export class Debts1788945156293 implements MigrationInterface {
    name = 'Debts1788945156293'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "debt_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "debtId" uuid NOT NULL, "amount" bigint NOT NULL, "date" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_53e3004f438dfaee6e6c67b5ce5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_2964cc6754b75a118b654de17e" ON "debt_payments" ("debtId", "date") `);
        await queryRunner.query(`CREATE TYPE "public"."debts_strategy_enum" AS ENUM('snowball', 'avalanche')`);
        await queryRunner.query(`CREATE TABLE "debts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "name" character varying NOT NULL, "lender" character varying, "principal" bigint NOT NULL, "remaining" bigint NOT NULL, "interestRate" double precision NOT NULL, "minPayment" bigint NOT NULL, "dueDay" integer NOT NULL, "strategy" "public"."debts_strategy_enum" NOT NULL DEFAULT 'avalanche', "isPaid" boolean NOT NULL DEFAULT false, "startDate" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_4bd9f54aab9e59628a3a2657fa1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_953080a83e148f0bcdafd3c191" ON "debts" ("userId", "isPaid") `);
        await queryRunner.query(`ALTER TABLE "debt_payments" ADD CONSTRAINT "FK_d2a2d5006c00bb3998be54ec542" FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "debts" ADD CONSTRAINT "FK_834960a509c776eb841644a9bac" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "debts" DROP CONSTRAINT "FK_834960a509c776eb841644a9bac"`);
        await queryRunner.query(`ALTER TABLE "debt_payments" DROP CONSTRAINT "FK_d2a2d5006c00bb3998be54ec542"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_953080a83e148f0bcdafd3c191"`);
        await queryRunner.query(`DROP TABLE "debts"`);
        await queryRunner.query(`DROP TYPE "public"."debts_strategy_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2964cc6754b75a118b654de17e"`);
        await queryRunner.query(`DROP TABLE "debt_payments"`);
    }

}
