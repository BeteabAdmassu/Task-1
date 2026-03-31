import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReturns1700000000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extend audit_action_enum
    await queryRunner.query(`ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'RA_CREATED'`);
    await queryRunner.query(`ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'RA_SUBMITTED'`);
    await queryRunner.query(`ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'RA_STATUS_CHANGED'`);
    await queryRunner.query(`ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'RA_COMPLETED'`);

    // Return status enum
    await queryRunner.query(`
      CREATE TYPE return_status_enum AS ENUM (
        'DRAFT', 'SUBMITTED', 'APPROVED', 'SHIPPED', 'COMPLETED', 'CANCELLED'
      )
    `);

    // Return reason code enum
    await queryRunner.query(`
      CREATE TYPE return_reason_code_enum AS ENUM (
        'DAMAGED', 'WRONG_ITEM', 'QUALITY_ISSUE', 'OVERSTOCK', 'OTHER'
      )
    `);

    // Return policies table (singleton, id=1)
    await queryRunner.query(`
      CREATE TABLE return_policies (
        id INT PRIMARY KEY,
        "returnWindowDays" INT NOT NULL DEFAULT 14,
        "restockingFeeDefault" DECIMAL(5,2) NOT NULL DEFAULT 15,
        "restockingFeeAfterDaysThreshold" INT NOT NULL DEFAULT 7,
        "restockingFeeAfterDays" DECIMAL(5,2) NOT NULL DEFAULT 20,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`INSERT INTO return_policies VALUES (1, 14, 15, 7, 20, now())`);

    // RA number sequence
    await queryRunner.query(`CREATE SEQUENCE ra_number_seq START 1`);

    // Return authorizations table
    await queryRunner.query(`
      CREATE TABLE return_authorizations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "raNumber" VARCHAR(20) NOT NULL UNIQUE,
        "receiptId" UUID NOT NULL REFERENCES receipts(id) ON DELETE RESTRICT,
        "poId" UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
        "supplierId" UUID REFERENCES suppliers(id) ON DELETE SET NULL,
        "createdBy" UUID REFERENCES users(id) ON DELETE SET NULL,
        status return_status_enum NOT NULL DEFAULT 'DRAFT',
        "returnWindowDays" INT NOT NULL DEFAULT 14,
        "returnDeadline" DATE NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_ra_supplier_id ON return_authorizations("supplierId")`);
    await queryRunner.query(`CREATE INDEX idx_ra_receipt_id ON return_authorizations("receiptId")`);

    // Return line items table
    await queryRunner.query(`
      CREATE TABLE return_line_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "raId" UUID NOT NULL REFERENCES return_authorizations(id) ON DELETE CASCADE,
        "receiptLineItemId" UUID NOT NULL REFERENCES receipt_line_items(id) ON DELETE RESTRICT,
        "quantityReturned" DECIMAL(10,2) NOT NULL,
        "reasonCode" return_reason_code_enum NOT NULL,
        "reasonNotes" TEXT,
        "restockingFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
        "restockingFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
        "refundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS return_line_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS return_authorizations`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS ra_number_seq`);
    await queryRunner.query(`DROP TABLE IF EXISTS return_policies`);
    await queryRunner.query(`DROP TYPE IF EXISTS return_reason_code_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS return_status_enum`);
  }
}
