import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReceiving1700000000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extend audit_action_enum
    await queryRunner.query(`ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'RECEIPT_CREATED'`);
    await queryRunner.query(`ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'RECEIPT_COMPLETED'`);

    // Putaway locations
    await queryRunner.query(`
      CREATE TABLE putaway_locations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(20) NOT NULL UNIQUE,
        description VARCHAR(200),
        zone VARCHAR(50),
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // Receipt number sequence
    await queryRunner.query(`CREATE SEQUENCE receipt_number_seq START 1`);

    // Receipt status enum
    await queryRunner.query(`
      CREATE TYPE receipt_status_enum AS ENUM ('IN_PROGRESS', 'COMPLETED')
    `);

    // Variance reason code enum
    await queryRunner.query(`
      CREATE TYPE variance_reason_code_enum AS ENUM (
        'NONE', 'SHORT_SHIPMENT', 'OVER_SHIPMENT', 'DAMAGED', 'WRONG_ITEM', 'OTHER'
      )
    `);

    // Receipts table
    await queryRunner.query(`
      CREATE TABLE receipts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "receiptNumber" VARCHAR(20) NOT NULL UNIQUE,
        "poId" UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
        "receivedBy" UUID REFERENCES users(id) ON DELETE SET NULL,
        "receivedAt" TIMESTAMP,
        status receipt_status_enum NOT NULL DEFAULT 'IN_PROGRESS',
        notes TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_receipts_po_id ON receipts("poId")`);

    // Receipt line items table
    await queryRunner.query(`
      CREATE TABLE receipt_line_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "receiptId" UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
        "poLineItemId" UUID NOT NULL REFERENCES purchase_order_line_items(id) ON DELETE RESTRICT,
        "quantityExpected" DECIMAL(10,2) NOT NULL,
        "quantityReceived" DECIMAL(10,2) NOT NULL,
        "varianceQuantity" DECIMAL(10,2) NOT NULL,
        "varianceReasonCode" variance_reason_code_enum NOT NULL DEFAULT 'NONE',
        "varianceNotes" TEXT,
        "putawayLocationId" UUID REFERENCES putaway_locations(id) ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS receipt_line_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS receipts`);
    await queryRunner.query(`DROP TYPE IF EXISTS variance_reason_code_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS receipt_status_enum`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS receipt_number_seq`);
    await queryRunner.query(`DROP TABLE IF EXISTS putaway_locations`);
  }
}
