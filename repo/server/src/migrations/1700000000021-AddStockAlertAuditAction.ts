import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `STOCK_ALERT_INGESTED` value to `audit_action_enum`.
 *
 * The value was introduced in `src/common/enums/audit-action.enum.ts` and is
 * written by `ProcurementService.ingestLowStockAlert()` but no prior
 * migration extended the Postgres enum, so any real low-stock-alert request
 * would fail with "invalid input value for enum audit_action_enum".
 */
export class AddStockAlertAuditAction1700000000021 implements MigrationInterface {
  name = 'AddStockAlertAuditAction1700000000021';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'STOCK_ALERT_INGESTED'`,
    );
  }

  // Postgres does not support removing enum values; down() is a no-op.
  async down(_queryRunner: QueryRunner): Promise<void> {}
}
