import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateProcurement1700000000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "request_status_enum" AS ENUM (
        'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "approval_action_enum" AS ENUM ('APPROVE', 'REJECT')
    `);

    // Add new audit actions
    await queryRunner.query(`
      ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'PR_CREATED';
      ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'PR_SUBMITTED';
      ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'PR_AUTO_APPROVED';
      ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'PR_APPROVED';
      ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'PR_REJECTED';
      ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'PR_CANCELLED';
    `);

    // Sequence for request numbers
    await queryRunner.query(`
      CREATE SEQUENCE IF NOT EXISTS pr_number_seq START 1
    `);

    await queryRunner.createTable(
      new Table({
        name: 'purchase_requests',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'requestNumber',
            type: 'varchar',
            length: '20',
            isUnique: true,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '200',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'requestedBy',
            type: 'uuid',
          },
          {
            name: 'supplierId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'totalAmount',
            type: 'decimal',
            precision: 12,
            scale: 2,
            default: 0,
          },
          {
            name: 'status',
            type: 'request_status_enum',
            default: "'DRAFT'",
          },
          {
            name: 'approvalTier',
            type: 'int',
            default: 0,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['requestedBy'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
          {
            columnNames: ['supplierId'],
            referencedTableName: 'suppliers',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'purchase_request_line_items',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'requestId',
            type: 'uuid',
          },
          {
            name: 'itemDescription',
            type: 'varchar',
            length: '300',
          },
          {
            name: 'quantity',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'unitPrice',
            type: 'decimal',
            precision: 12,
            scale: 2,
          },
          {
            name: 'totalPrice',
            type: 'decimal',
            precision: 12,
            scale: 2,
          },
          {
            name: 'catalogItemId',
            type: 'uuid',
            isNullable: true,
          },
        ],
        foreignKeys: [
          {
            columnNames: ['requestId'],
            referencedTableName: 'purchase_requests',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'approvals',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'requestId',
            type: 'uuid',
          },
          {
            name: 'approverId',
            type: 'uuid',
          },
          {
            name: 'action',
            type: 'approval_action_enum',
          },
          {
            name: 'comments',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['requestId'],
            referencedTableName: 'purchase_requests',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['approverId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('approvals');
    await queryRunner.dropTable('purchase_request_line_items');
    await queryRunner.dropTable('purchase_requests');
    await queryRunner.query('DROP SEQUENCE IF EXISTS pr_number_seq');
    await queryRunner.query('DROP TYPE "approval_action_enum"');
    await queryRunner.query('DROP TYPE "request_status_enum"');
  }
}
