import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreatePurchaseOrders1700000000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "po_status_enum" AS ENUM (
        'DRAFT', 'ISSUED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED', 'CANCELLED'
      )
    `);

    await queryRunner.query(`
      ALTER TYPE "audit_action_enum"
        ADD VALUE IF NOT EXISTS 'PO_CREATED';
      ALTER TYPE "audit_action_enum"
        ADD VALUE IF NOT EXISTS 'PO_ISSUED';
      ALTER TYPE "audit_action_enum"
        ADD VALUE IF NOT EXISTS 'PO_CANCELLED';
      ALTER TYPE "audit_action_enum"
        ADD VALUE IF NOT EXISTS 'PO_STATUS_CHANGED';
    `);

    await queryRunner.query(`
      CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1
    `);

    await queryRunner.createTable(
      new Table({
        name: 'purchase_orders',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'poNumber', type: 'varchar', length: '20', isUnique: true },
          { name: 'requestId', type: 'uuid', isNullable: true },
          { name: 'supplierId', type: 'uuid', isNullable: true },
          { name: 'totalAmount', type: 'decimal', precision: 12, scale: 2, default: 0 },
          { name: 'status', type: 'po_status_enum', default: "'DRAFT'" },
          { name: 'issuedAt', type: 'timestamp', isNullable: true },
          { name: 'expectedDeliveryDate', type: 'date', isNullable: true },
          { name: 'notes', type: 'text', isNullable: true },
          { name: 'createdBy', type: 'uuid', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
        foreignKeys: [
          {
            columnNames: ['requestId'],
            referencedTableName: 'purchase_requests',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
          {
            columnNames: ['supplierId'],
            referencedTableName: 'suppliers',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
          {
            columnNames: ['createdBy'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'purchase_order_line_items',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'poId', type: 'uuid' },
          { name: 'description', type: 'varchar', length: '300' },
          { name: 'quantity', type: 'decimal', precision: 10, scale: 2 },
          { name: 'unitPrice', type: 'decimal', precision: 12, scale: 2 },
          { name: 'totalPrice', type: 'decimal', precision: 12, scale: 2 },
          { name: 'quantityReceived', type: 'decimal', precision: 10, scale: 2, default: 0 },
          { name: 'catalogItemId', type: 'uuid', isNullable: true },
        ],
        foreignKeys: [
          {
            columnNames: ['poId'],
            referencedTableName: 'purchase_orders',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('purchase_order_line_items');
    await queryRunner.dropTable('purchase_orders');
    await queryRunner.query('DROP SEQUENCE IF EXISTS po_number_seq');
    await queryRunner.query('DROP TYPE "po_status_enum"');
  }
}
