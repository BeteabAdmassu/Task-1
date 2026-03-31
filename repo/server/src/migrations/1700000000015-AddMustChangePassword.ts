import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds mustChangePassword column to users table.
 * On existing installs, marks the bootstrap admin as requiring a password change.
 */
export class AddMustChangePassword1700000000015 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "mustChangePassword" boolean NOT NULL DEFAULT false
    `);

    // Mark the bootstrap admin as requiring password change.
    // This applies to both fresh installs (just created by migration 002) and
    // existing installs (created with the old hardcoded credential).
    const username = process.env.ADMIN_BOOTSTRAP_USERNAME || 'admin';
    await queryRunner.query(
      `UPDATE users SET "mustChangePassword" = true
       WHERE username = $1 AND role = 'ADMINISTRATOR'`,
      [username],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "mustChangePassword"`);
  }
}
