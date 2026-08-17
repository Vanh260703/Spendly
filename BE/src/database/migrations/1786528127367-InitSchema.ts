import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1786528127367 implements MigrationInterface {
    name = 'InitSchema1786528127367'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" character varying NOT NULL, "passwordHash" character varying NOT NULL, "name" character varying NOT NULL, "avatarUrl" character varying, "timezone" character varying NOT NULL DEFAULT 'Asia/Ho_Chi_Minh', "monthStartDay" integer NOT NULL DEFAULT '1', "initialBalance" bigint NOT NULL DEFAULT '0', "startedAt" TIMESTAMP WITH TIME ZONE, "monthlyIncome" bigint, "onboardedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."categories_type_enum" AS ENUM('income', 'expense')`);
        await queryRunner.query(`CREATE TYPE "public"."categories_kind_enum" AS ENUM('need', 'want', 'saving')`);
        await queryRunner.query(`CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "name" character varying NOT NULL, "type" "public"."categories_type_enum" NOT NULL, "kind" "public"."categories_kind_enum" NOT NULL DEFAULT 'need', "icon" character varying NOT NULL, "color" character varying NOT NULL, "parentId" uuid, "isDefault" boolean NOT NULL DEFAULT false, "isSystem" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0c9ff8bc60e0360c85c8141a0c" ON "categories" ("userId", "type") `);
        await queryRunner.query(`CREATE TYPE "public"."transactions_type_enum" AS ENUM('income', 'expense')`);
        await queryRunner.query(`CREATE TABLE "transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "categoryId" uuid NOT NULL, "type" "public"."transactions_type_enum" NOT NULL, "amount" bigint NOT NULL, "date" TIMESTAMP WITH TIME ZONE NOT NULL, "note" character varying, "tags" text array NOT NULL DEFAULT '{}', "importHash" character varying, CONSTRAINT "UQ_2b262bca16b7cc1d9c6a2ae06cb" UNIQUE ("userId", "importHash"), CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_aa2e9c4ecf80dd1204909fd22c" ON "transactions" ("userId", "categoryId", "date") `);
        await queryRunner.query(`CREATE INDEX "IDX_31c0fafe7c59f688d0e7e7e322" ON "transactions" ("userId", "date") `);
        await queryRunner.query(`CREATE TABLE "goal_contributions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "goalId" uuid NOT NULL, "amount" bigint NOT NULL, "date" TIMESTAMP WITH TIME ZONE NOT NULL, "note" character varying, CONSTRAINT "PK_33413874ace4630a4451a4f4bda" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b89fa587c731f06418d76344f9" ON "goal_contributions" ("goalId", "date") `);
        await queryRunner.query(`CREATE TYPE "public"."goals_horizon_enum" AS ENUM('short', 'long')`);
        await queryRunner.query(`CREATE TYPE "public"."goals_status_enum" AS ENUM('active', 'achieved', 'paused', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "goals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "name" character varying NOT NULL, "description" character varying, "horizon" "public"."goals_horizon_enum" NOT NULL, "targetAmount" bigint NOT NULL, "currentAmount" bigint NOT NULL DEFAULT '0', "deadline" TIMESTAMP WITH TIME ZONE, "monthlyContribution" bigint, "status" "public"."goals_status_enum" NOT NULL DEFAULT 'active', "icon" character varying NOT NULL, "color" character varying NOT NULL, CONSTRAINT "PK_26e17b251afab35580dff769223" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_618b41eda280b30fe5e8611b8d" ON "goals" ("userId", "status") `);
        await queryRunner.query(`CREATE TABLE "debt_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "debtId" uuid NOT NULL, "amount" bigint NOT NULL, "date" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_53e3004f438dfaee6e6c67b5ce5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_2964cc6754b75a118b654de17e" ON "debt_payments" ("debtId", "date") `);
        await queryRunner.query(`CREATE TYPE "public"."debts_strategy_enum" AS ENUM('snowball', 'avalanche')`);
        await queryRunner.query(`CREATE TABLE "debts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "name" character varying NOT NULL, "lender" character varying, "principal" bigint NOT NULL, "remaining" bigint NOT NULL, "interestRate" double precision NOT NULL, "minPayment" bigint NOT NULL, "dueDay" integer NOT NULL, "strategy" "public"."debts_strategy_enum" NOT NULL DEFAULT 'avalanche', "isPaid" boolean NOT NULL DEFAULT false, "startDate" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_4bd9f54aab9e59628a3a2657fa1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_953080a83e148f0bcdafd3c191" ON "debts" ("userId", "isPaid") `);
        await queryRunner.query(`CREATE TYPE "public"."budgets_period_enum" AS ENUM('weekly', 'monthly')`);
        await queryRunner.query(`CREATE TABLE "budgets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "categoryId" uuid, "period" "public"."budgets_period_enum" NOT NULL DEFAULT 'monthly', "amount" bigint NOT NULL, "startDate" TIMESTAMP WITH TIME ZONE NOT NULL, "rollover" boolean NOT NULL DEFAULT false, "alertThreshold" double precision NOT NULL DEFAULT '0.8', "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_9c8a51748f82387644b773da482" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f7a8548b9983fdb93c5b960e48" ON "budgets" ("userId", "isActive") `);
        await queryRunner.query(`CREATE TYPE "public"."chat_messages_role_enum" AS ENUM('user', 'assistant')`);
        await queryRunner.query(`CREATE TABLE "chat_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "conversationId" uuid NOT NULL, "role" "public"."chat_messages_role_enum" NOT NULL, "content" text NOT NULL, CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d09a19c6f89d61088d029686cb" ON "chat_messages" ("userId", "conversationId", "createdAt") `);
        await queryRunner.query(`CREATE TYPE "public"."ai_insights_kind_enum" AS ENUM('weekly', 'monthly', 'necessity', 'anomaly', 'forecast', 'health_score')`);
        await queryRunner.query(`CREATE TABLE "ai_insights" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "kind" "public"."ai_insights_kind_enum" NOT NULL, "periodStart" TIMESTAMP WITH TIME ZONE NOT NULL, "periodEnd" TIMESTAMP WITH TIME ZONE NOT NULL, "inputHash" character varying NOT NULL, "content" text NOT NULL, "structured" jsonb, "model" character varying NOT NULL, "tokensUsed" integer NOT NULL DEFAULT '0', CONSTRAINT "UQ_44d792dac5f8cfbc55035025a98" UNIQUE ("userId", "kind", "inputHash"), CONSTRAINT "PK_b9f050c4c7b63c358346f3aa31c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_7daa1bcf4f85a932cad4ef3949" ON "ai_insights" ("userId", "kind", "periodStart") `);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_13e8b2a21988bec6fdcbb1fa741" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_6bb58f2b6e30cb51a6504599f41" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_86e965e74f9cc66149cf6c90f64" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "goal_contributions" ADD CONSTRAINT "FK_e112aa3187037cdbcba9b4eb7b7" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "goals" ADD CONSTRAINT "FK_57dd8a3fc26eb760d076bf8840e" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "debt_payments" ADD CONSTRAINT "FK_d2a2d5006c00bb3998be54ec542" FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "debts" ADD CONSTRAINT "FK_834960a509c776eb841644a9bac" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "budgets" ADD CONSTRAINT "FK_27e688ddf1ff3893b43065899f9" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "budgets" ADD CONSTRAINT "FK_3ece6e1292b7a86ba82145775a7" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_43d968962b9e24e1e3517c0fbff" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ai_insights" ADD CONSTRAINT "FK_09bc54247d53d6d4a3494fe05aa" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ai_insights" DROP CONSTRAINT "FK_09bc54247d53d6d4a3494fe05aa"`);
        await queryRunner.query(`ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_43d968962b9e24e1e3517c0fbff"`);
        await queryRunner.query(`ALTER TABLE "budgets" DROP CONSTRAINT "FK_3ece6e1292b7a86ba82145775a7"`);
        await queryRunner.query(`ALTER TABLE "budgets" DROP CONSTRAINT "FK_27e688ddf1ff3893b43065899f9"`);
        await queryRunner.query(`ALTER TABLE "debts" DROP CONSTRAINT "FK_834960a509c776eb841644a9bac"`);
        await queryRunner.query(`ALTER TABLE "debt_payments" DROP CONSTRAINT "FK_d2a2d5006c00bb3998be54ec542"`);
        await queryRunner.query(`ALTER TABLE "goals" DROP CONSTRAINT "FK_57dd8a3fc26eb760d076bf8840e"`);
        await queryRunner.query(`ALTER TABLE "goal_contributions" DROP CONSTRAINT "FK_e112aa3187037cdbcba9b4eb7b7"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_86e965e74f9cc66149cf6c90f64"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_6bb58f2b6e30cb51a6504599f41"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_13e8b2a21988bec6fdcbb1fa741"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7daa1bcf4f85a932cad4ef3949"`);
        await queryRunner.query(`DROP TABLE "ai_insights"`);
        await queryRunner.query(`DROP TYPE "public"."ai_insights_kind_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d09a19c6f89d61088d029686cb"`);
        await queryRunner.query(`DROP TABLE "chat_messages"`);
        await queryRunner.query(`DROP TYPE "public"."chat_messages_role_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f7a8548b9983fdb93c5b960e48"`);
        await queryRunner.query(`DROP TABLE "budgets"`);
        await queryRunner.query(`DROP TYPE "public"."budgets_period_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_953080a83e148f0bcdafd3c191"`);
        await queryRunner.query(`DROP TABLE "debts"`);
        await queryRunner.query(`DROP TYPE "public"."debts_strategy_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2964cc6754b75a118b654de17e"`);
        await queryRunner.query(`DROP TABLE "debt_payments"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_618b41eda280b30fe5e8611b8d"`);
        await queryRunner.query(`DROP TABLE "goals"`);
        await queryRunner.query(`DROP TYPE "public"."goals_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."goals_horizon_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b89fa587c731f06418d76344f9"`);
        await queryRunner.query(`DROP TABLE "goal_contributions"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_31c0fafe7c59f688d0e7e7e322"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_aa2e9c4ecf80dd1204909fd22c"`);
        await queryRunner.query(`DROP TABLE "transactions"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0c9ff8bc60e0360c85c8141a0c"`);
        await queryRunner.query(`DROP TABLE "categories"`);
        await queryRunner.query(`DROP TYPE "public"."categories_kind_enum"`);
        await queryRunner.query(`DROP TYPE "public"."categories_type_enum"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
