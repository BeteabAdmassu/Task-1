import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class CreateSuppliers1700000000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "payment_terms_enum" AS ENUM (
        'NET_30',
        'TWO_TEN_NET_30',
        'NET_60',
        'COD',
        'CUSTOM'
      )
    `);

    await queryRunner.createTable(
      new Table({
        name: 'suppliers',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '200',
          },
          {
            name: 'contactName',
            type: 'varchar',
            length: '200',
            isNullable: true,
          },
          {
            name: 'email',
            type: 'varchar',
            length: '200',
            isNullable: true,
          },
          {
            name: 'phone',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'address',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'paymentTerms',
            type: 'payment_terms_enum',
            default: "'NET_30'",
          },
          {
            name: 'customTermsDescription',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'bankingNotes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'internalRiskFlag',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
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
      }),
      true,
    );

    // Add supplierId column to users table
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'supplierId',
        type: 'uuid',
        isNullable: true,
      }),
    );

    await queryRunner.createForeignKey(
      'users',
      new TableForeignKey({
        columnNames: ['supplierId'],
        referencedTableName: 'suppliers',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    const fk = table?.foreignKeys.find((fk) => fk.columnNames.includes('supplierId'));
    if (fk) await queryRunner.dropForeignKey('users', fk);
    await queryRunner.dropColumn('users', 'supplierId');
    await queryRunner.dropTable('suppliers');
    await queryRunner.query('DROP TYPE "payment_terms_enum"');
  }
}
