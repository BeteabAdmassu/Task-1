import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateAuditLogs1700000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "audit_action_enum" AS ENUM (
        'USER_CREATED',
        'USER_UPDATED',
        'USER_DEACTIVATED',
        'USER_ACTIVATED',
        'USER_PASSWORD_RESET'
      )
    `);

    await queryRunner.createTable(
      new Table({
        name: 'audit_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'userId',
            type: 'uuid',
          },
          {
            name: 'action',
            type: 'audit_action_enum',
          },
          {
            name: 'targetEntity',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'targetId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'details',
            type: 'jsonb',
            default: "'{}'",
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['userId'],
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
    await queryRunner.dropTable('audit_logs');
    await queryRunner.query('DROP TYPE "audit_action_enum"');
  }
}
