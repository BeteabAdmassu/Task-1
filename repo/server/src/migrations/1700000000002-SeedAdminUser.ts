import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';

export class SeedAdminUser1700000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const passwordHash = await bcrypt.hash('admin1234', 12);
    await queryRunner.query(
      `INSERT INTO users (username, "passwordHash", role, "isActive")
       VALUES ('admin', $1, 'ADMINISTRATOR', true)
       ON CONFLICT (username) DO NOTHING`,
      [passwordHash],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM users WHERE username = 'admin'`);
  }
}
