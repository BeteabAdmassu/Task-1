import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';

/**
 * Bootstrap admin user.
 *
 * NO hardcoded credential exists here. The admin is created only when the
 * ADMIN_BOOTSTRAP_PASSWORD environment variable is set before the first run.
 *
 * Required env vars:
 *   ADMIN_BOOTSTRAP_PASSWORD  — initial admin password (must be changed after first login)
 *   ADMIN_BOOTSTRAP_USERNAME  — optional, defaults to "admin"
 *
 * After the first successful login the operator should unset ADMIN_BOOTSTRAP_PASSWORD.
 */
export class SeedAdminUser1700000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;

    if (!bootstrapPassword) {
      console.warn(
        '[GreenLeaf] ADMIN_BOOTSTRAP_PASSWORD is not set — no initial admin user created. ' +
          'Set this env var before the first run to create the initial administrator account.',
      );
      return;
    }

    const username = process.env.ADMIN_BOOTSTRAP_USERNAME || 'admin';
    const passwordHash = await bcrypt.hash(bootstrapPassword, 12);

    await queryRunner.query(
      `INSERT INTO users (username, "passwordHash", role, "isActive")
       VALUES ($1, $2, 'ADMINISTRATOR', true)
       ON CONFLICT (username) DO NOTHING`,
      [username, passwordHash],
    );

    console.log(
      `[GreenLeaf] Bootstrap admin "${username}" created. ` +
        'A password change will be enforced on first login.',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const username = process.env.ADMIN_BOOTSTRAP_USERNAME || 'admin';
    await queryRunner.query(
      `DELETE FROM users WHERE username = $1 AND role = 'ADMINISTRATOR'`,
      [username],
    );
  }
}
