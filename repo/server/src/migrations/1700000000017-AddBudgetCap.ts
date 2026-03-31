import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBudgetCap1700000000017 implements MigrationInterface {
  name = 'AddBudgetCap1700000000017';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Nullable budget cap on suppliers; null = no cap enforced
    await queryRunner.query(`
      ALTER TABLE suppliers
      ADD COLUMN IF NOT EXISTS "budgetCap" DECIMAL(14,2) DEFAULT NULL
    `);

    // Audit table for authorized budget-cap overrides
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS budget_overrides (
        id             UUID        NOT NULL DEFAULT gen_random_uuid(),
        "poId"         UUID        NOT NULL,
        "supplierId"   UUID        NOT NULL,
        "authorizedBy" UUID        NOT NULL,
        "overrideAmount"   DECIMAL(14,2) NOT NULL,
        "availableAtTime"  DECIMAL(14,2) NOT NULL,
        reason         TEXT        NOT NULL,
        "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_budget_overrides PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_budget_overrides_po
      ON budget_overrides("poId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_budget_overrides_supplier
      ON budget_overrides("supplierId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_budget_overrides_authorized_by
      ON budget_overrides("authorizedBy")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS budget_overrides`);
    await queryRunner.query(`ALTER TABLE suppliers DROP COLUMN IF EXISTS "budgetCap"`);
  }
}
