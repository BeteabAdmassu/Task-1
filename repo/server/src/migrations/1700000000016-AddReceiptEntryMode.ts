import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReceiptEntryMode1700000000016 implements MigrationInterface {
  name = 'AddReceiptEntryMode1700000000016';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type if it doesn't exist
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "receiving_entry_mode_enum" AS ENUM ('BARCODE', 'MANUAL');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add entryMode column with default MANUAL for backward compatibility
    await queryRunner.query(`
      ALTER TABLE receipts
      ADD COLUMN IF NOT EXISTS "entryMode" "receiving_entry_mode_enum" NOT NULL DEFAULT 'MANUAL'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE receipts DROP COLUMN IF EXISTS "entryMode"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "receiving_entry_mode_enum"`);
  }
}
