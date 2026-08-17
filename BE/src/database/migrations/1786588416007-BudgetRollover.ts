import { MigrationInterface, QueryRunner } from "typeorm";

export class BudgetRollover1786588416007 implements MigrationInterface {
    name = 'BudgetRollover1786588416007'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."budget_period_results_period_enum" AS ENUM('weekly', 'monthly')`);
        await queryRunner.query(`CREATE TABLE "budget_period_results" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "budgetId" uuid, "categoryId" uuid, "categoryName" character varying, "period" "public"."budget_period_results_period_enum" NOT NULL, "periodStart" TIMESTAMP WITH TIME ZONE NOT NULL, "periodEnd" TIMESTAMP WITH TIME ZONE NOT NULL, "amount" bigint NOT NULL, "rolloverIn" bigint NOT NULL DEFAULT '0', "effectiveAmount" bigint NOT NULL, "spent" bigint NOT NULL, "rolloverOut" bigint NOT NULL DEFAULT '0', CONSTRAINT "UQ_17a0cd912dbeaea1cc9f0fce8f3" UNIQUE ("budgetId", "periodStart"), CONSTRAINT "PK_c1e6f96877eafad3af92e8330bc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3bc511ed11295f1355f91ce693" ON "budget_period_results" ("userId", "periodStart") `);
        await queryRunner.query(`ALTER TABLE "budgets" ADD "rolloverCapRatio" double precision NOT NULL DEFAULT '0.5'`);
        await queryRunner.query(`ALTER TABLE "budget_period_results" ADD CONSTRAINT "FK_33c5c0abecbd13c943b7c0a4f5a" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "budget_period_results" ADD CONSTRAINT "FK_0797cf621eb389a72e9402df78d" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "budget_period_results" DROP CONSTRAINT "FK_0797cf621eb389a72e9402df78d"`);
        await queryRunner.query(`ALTER TABLE "budget_period_results" DROP CONSTRAINT "FK_33c5c0abecbd13c943b7c0a4f5a"`);
        await queryRunner.query(`ALTER TABLE "budgets" DROP COLUMN "rolloverCapRatio"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3bc511ed11295f1355f91ce693"`);
        await queryRunner.query(`DROP TABLE "budget_period_results"`);
        await queryRunner.query(`DROP TYPE "public"."budget_period_results_period_enum"`);
    }

}
