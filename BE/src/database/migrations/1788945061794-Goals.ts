import { MigrationInterface, QueryRunner } from "typeorm";

export class Goals1788945061794 implements MigrationInterface {
    name = 'Goals1788945061794'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "goal_contributions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "goalId" uuid NOT NULL, "amount" bigint NOT NULL, "date" TIMESTAMP WITH TIME ZONE NOT NULL, "note" character varying, CONSTRAINT "PK_33413874ace4630a4451a4f4bda" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b89fa587c731f06418d76344f9" ON "goal_contributions" ("goalId", "date") `);
        await queryRunner.query(`CREATE TYPE "public"."goals_horizon_enum" AS ENUM('short', 'long')`);
        await queryRunner.query(`CREATE TYPE "public"."goals_status_enum" AS ENUM('active', 'achieved', 'paused', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "goals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "name" character varying NOT NULL, "description" character varying, "horizon" "public"."goals_horizon_enum" NOT NULL, "targetAmount" bigint NOT NULL, "currentAmount" bigint NOT NULL DEFAULT '0', "deadline" TIMESTAMP WITH TIME ZONE, "monthlyContribution" bigint, "status" "public"."goals_status_enum" NOT NULL DEFAULT 'active', "icon" character varying NOT NULL, "color" character varying NOT NULL, CONSTRAINT "PK_26e17b251afab35580dff769223" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_618b41eda280b30fe5e8611b8d" ON "goals" ("userId", "status") `);
        await queryRunner.query(`ALTER TABLE "goal_contributions" ADD CONSTRAINT "FK_e112aa3187037cdbcba9b4eb7b7" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "goals" ADD CONSTRAINT "FK_57dd8a3fc26eb760d076bf8840e" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "goals" DROP CONSTRAINT "FK_57dd8a3fc26eb760d076bf8840e"`);
        await queryRunner.query(`ALTER TABLE "goal_contributions" DROP CONSTRAINT "FK_e112aa3187037cdbcba9b4eb7b7"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_618b41eda280b30fe5e8611b8d"`);
        await queryRunner.query(`DROP TABLE "goals"`);
        await queryRunner.query(`DROP TYPE "public"."goals_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."goals_horizon_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b89fa587c731f06418d76344f9"`);
        await queryRunner.query(`DROP TABLE "goal_contributions"`);
    }

}
