import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKnowledgeBase1700000000010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extend audit_action_enum
    await queryRunner.query(`ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'ARTICLE_CREATED'`);
    await queryRunner.query(`ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'ARTICLE_UPDATED'`);
    await queryRunner.query(`ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'ARTICLE_PROMOTED'`);
    await queryRunner.query(`ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'ARTICLE_ARCHIVED'`);

    // Article category and status enums
    await queryRunner.query(`
      CREATE TYPE article_category_enum AS ENUM (
        'CARE_GUIDE', 'PEST_TREATMENT_SOP', 'SAFETY_NOTE', 'GENERAL'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE article_status_enum AS ENUM (
        'DRAFT', 'SPECIALIST_ONLY', 'STOREWIDE', 'ARCHIVED'
      )
    `);

    // Articles table
    await queryRunner.query(`
      CREATE TABLE articles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(300) NOT NULL,
        slug VARCHAR(300) NOT NULL UNIQUE,
        category article_category_enum NOT NULL DEFAULT 'GENERAL',
        content TEXT NOT NULL DEFAULT '',
        tags TEXT[] NOT NULL DEFAULT '{}',
        status article_status_enum NOT NULL DEFAULT 'DRAFT',
        "currentVersionId" UUID,
        "authorId" UUID REFERENCES users(id) ON DELETE SET NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_articles_status ON articles(status)`);
    await queryRunner.query(`CREATE INDEX idx_articles_category ON articles(category)`);
    await queryRunner.query(`CREATE INDEX idx_articles_author ON articles("authorId")`);

    // Article versions table
    await queryRunner.query(`
      CREATE TABLE article_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "articleId" UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        "versionNumber" INT NOT NULL,
        title VARCHAR(300) NOT NULL,
        content TEXT NOT NULL,
        "changeSummary" TEXT,
        "createdBy" UUID REFERENCES users(id) ON DELETE SET NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        UNIQUE("articleId", "versionNumber")
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_av_article_id ON article_versions("articleId")`);

    // User favorites table
    await queryRunner.query(`
      CREATE TABLE user_favorites (
        "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "articleId" UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        PRIMARY KEY ("userId", "articleId")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_favorites`);
    await queryRunner.query(`DROP TABLE IF EXISTS article_versions`);
    await queryRunner.query(`DROP TABLE IF EXISTS articles`);
    await queryRunner.query(`DROP TYPE IF EXISTS article_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS article_category_enum`);
  }
}
