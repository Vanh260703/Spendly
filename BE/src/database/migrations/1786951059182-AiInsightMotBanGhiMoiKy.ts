import { MigrationInterface, QueryRunner } from "typeorm";

export class AiInsightMotBanGhiMoiKy1786951059182 implements MigrationInterface {
    name = 'AiInsightMotBanGhiMoiKy1786951059182'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ai_insights" DROP CONSTRAINT "UQ_44d792dac5f8cfbc55035025a98"`);
        await queryRunner.query(`CREATE INDEX "IDX_44d792dac5f8cfbc55035025a9" ON "ai_insights" ("userId", "kind", "inputHash") `);
        await queryRunner.query(`ALTER TABLE "ai_insights" ADD CONSTRAINT "UQ_7daa1bcf4f85a932cad4ef3949b" UNIQUE ("userId", "kind", "periodStart")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ai_insights" DROP CONSTRAINT "UQ_7daa1bcf4f85a932cad4ef3949b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_44d792dac5f8cfbc55035025a9"`);
        await queryRunner.query(`ALTER TABLE "ai_insights" ADD CONSTRAINT "UQ_44d792dac5f8cfbc55035025a98" UNIQUE ("userId", "kind", "inputHash")`);
    }

}
