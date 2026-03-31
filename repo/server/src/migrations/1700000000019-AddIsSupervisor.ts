import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsSupervisor1700000000019 implements MigrationInterface {
  name = 'AddIsSupervisor1700000000019';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS "isSupervisor" BOOLEAN NOT NULL DEFAULT false`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users DROP COLUMN IF EXISTS "isSupervisor"`,
    );
  }
}
