import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateObservability1700000000014 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE system_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "requestId" VARCHAR(64),
        "userId" UUID,
        level VARCHAR(10) NOT NULL DEFAULT 'INFO',
        service VARCHAR(100),
        message TEXT NOT NULL,
        method VARCHAR(10),
        path TEXT,
        "statusCode" INTEGER,
        "durationMs" INTEGER,
        metadata JSONB,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_system_logs_level" ON system_logs (level)`);
    await queryRunner.query(`CREATE INDEX "IDX_system_logs_service" ON system_logs (service)`);
    await queryRunner.query(`CREATE INDEX "IDX_system_logs_createdAt" ON system_logs ("createdAt" DESC)`);

    await queryRunner.query(`
      CREATE TABLE job_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "jobName" VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
        "startedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "finishedAt" TIMESTAMPTZ,
        "durationMs" INTEGER,
        attempt INTEGER NOT NULL DEFAULT 1,
        "errorMessage" TEXT,
        metadata JSONB
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_job_runs_jobName" ON job_runs ("jobName")`);
    await queryRunner.query(`CREATE INDEX "IDX_job_runs_status" ON job_runs (status)`);
    await queryRunner.query(`CREATE INDEX "IDX_job_runs_startedAt" ON job_runs ("startedAt" DESC)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS job_runs`);
    await queryRunner.query(`DROP TABLE IF EXISTS system_logs`);
  }
}
