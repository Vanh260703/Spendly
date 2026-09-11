import { MigrationInterface, QueryRunner } from "typeorm";

export class Ai1788945984089 implements MigrationInterface {
    name = 'Ai1788945984089'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."ai_insights_kind_enum" AS ENUM('weekly', 'monthly', 'necessity', 'anomaly', 'forecast', 'health_score')`);
        await queryRunner.query(`CREATE TABLE "ai_insights" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "kind" "public"."ai_insights_kind_enum" NOT NULL, "periodStart" TIMESTAMP WITH TIME ZONE NOT NULL, "periodEnd" TIMESTAMP WITH TIME ZONE NOT NULL, "inputHash" character varying NOT NULL, "content" text NOT NULL, "structured" jsonb, "model" character varying NOT NULL, "tokensUsed" integer NOT NULL DEFAULT '0', CONSTRAINT "UQ_7daa1bcf4f85a932cad4ef3949b" UNIQUE ("userId", "kind", "periodStart"), CONSTRAINT "PK_b9f050c4c7b63c358346f3aa31c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_44d792dac5f8cfbc55035025a9" ON "ai_insights" ("userId", "kind", "inputHash") `);
        await queryRunner.query(`CREATE INDEX "IDX_7daa1bcf4f85a932cad4ef3949" ON "ai_insights" ("userId", "kind", "periodStart") `);
        await queryRunner.query(`ALTER TABLE "users" ADD "monthlyIncome" bigint`);
        await queryRunner.query(`ALTER TABLE "ai_insights" ADD CONSTRAINT "FK_09bc54247d53d6d4a3494fe05aa" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ai_insights" DROP CONSTRAINT "FK_09bc54247d53d6d4a3494fe05aa"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "monthlyIncome"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7daa1bcf4f85a932cad4ef3949"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_44d792dac5f8cfbc55035025a9"`);
        await queryRunner.query(`DROP TABLE "ai_insights"`);
        await queryRunner.query(`DROP TYPE "public"."ai_insights_kind_enum"`);
    }

}
