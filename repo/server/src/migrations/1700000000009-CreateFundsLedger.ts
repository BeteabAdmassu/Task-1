import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFundsLedger1700000000009 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ledger entry type enum
    await queryRunner.query(`
      CREATE TYPE ledger_entry_type_enum AS ENUM (
        'DEPOSIT', 'ESCROW_HOLD', 'ESCROW_RELEASE', 'PAYMENT', 'REFUND', 'ADJUSTMENT'
      )
    `);

    // Funds ledger entries table
    await queryRunner.query(`
      CREATE TABLE funds_ledger_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "supplierId" UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
        type ledger_entry_type_enum NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        "runningBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
        "referenceType" VARCHAR(50),
        "referenceId" UUID,
        description TEXT,
        "createdBy" UUID REFERENCES users(id) ON DELETE SET NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_ledger_supplier_id ON funds_ledger_entries("supplierId")`);
    await queryRunner.query(`CREATE INDEX idx_ledger_created_at ON funds_ledger_entries("createdAt")`);

    // Payment idempotency keys table
    await queryRunner.query(`
      CREATE TABLE payment_idempotency_keys (
        key VARCHAR(200) PRIMARY KEY,
        "connectorName" VARCHAR(50) NOT NULL,
        operation VARCHAR(20) NOT NULL,
        result JSONB,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS payment_idempotency_keys`);
    await queryRunner.query(`DROP TABLE IF EXISTS funds_ledger_entries`);
    await queryRunner.query(`DROP TYPE IF EXISTS ledger_entry_type_enum`);
  }
}
