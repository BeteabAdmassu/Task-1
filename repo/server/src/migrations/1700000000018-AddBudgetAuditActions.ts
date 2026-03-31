import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBudgetAuditActions1700000000018 implements MigrationInterface {
  name = 'AddBudgetAuditActions1700000000018';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'BUDGET_OVERRIDE'`,
    );
    await queryRunner.query(
      `ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'SUPPLIER_BUDGET_CAP_SET'`,
    );
  }

  // Postgres does not support removing enum values; down() is intentionally a no-op.
  async down(_queryRunner: QueryRunner): Promise<void> {}
}
