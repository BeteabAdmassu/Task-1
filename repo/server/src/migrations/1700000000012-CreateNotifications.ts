import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotifications1700000000012 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE notification_type_enum AS ENUM (
        'REQUEST_APPROVED', 'REQUEST_REJECTED', 'PO_ISSUED', 'RECEIPT_COMPLETED',
        'RETURN_CREATED', 'ARTICLE_PUBLISHED', 'SYSTEM_ALERT', 'SCHEDULE_CHANGE',
        'CANCELLATION', 'REVIEW_OUTCOME'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "recipientId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type notification_type_enum NOT NULL,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        "referenceType" VARCHAR(100),
        "referenceId" UUID,
        "isRead" BOOLEAN NOT NULL DEFAULT false,
        "readAt" TIMESTAMP,
        "isQueued" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_notifications_recipient ON notifications("recipientId", "createdAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_notifications_unread ON notifications("recipientId", "isRead") WHERE "isRead" = false
    `);

    await queryRunner.query(`
      CREATE TABLE notification_preferences (
        "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type notification_type_enum NOT NULL,
        "isEnabled" BOOLEAN NOT NULL DEFAULT true,
        PRIMARY KEY ("userId", type)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE notification_throttle (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL,
        type notification_type_enum NOT NULL,
        "attemptedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_throttle_user_time ON notification_throttle("userId", "attemptedAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_throttle_user_time`);
    await queryRunner.query(`DROP TABLE IF EXISTS notification_throttle`);
    await queryRunner.query(`DROP TABLE IF EXISTS notification_preferences`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_notifications_unread`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_notifications_recipient`);
    await queryRunner.query(`DROP TABLE IF EXISTS notifications`);
    await queryRunner.query(`DROP TYPE IF EXISTS notification_type_enum`);
  }
}
