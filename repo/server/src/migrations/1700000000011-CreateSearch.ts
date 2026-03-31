import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSearch1700000000011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pg_trgm for similarity search
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // Add tsvector column to articles (maintained by trigger)
    await queryRunner.query(`
      ALTER TABLE articles ADD COLUMN search_vector tsvector
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION articles_search_vector_update()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW.search_vector :=
          to_tsvector('english',
            coalesce(NEW.title, '') || ' ' ||
            coalesce(NEW.content, '') || ' ' ||
            coalesce(array_to_string(NEW.tags, ' '), '')
          );
        RETURN NEW;
      END;
      $$
    `);

    await queryRunner.query(`
      CREATE TRIGGER articles_search_vector_trigger
        BEFORE INSERT OR UPDATE ON articles
        FOR EACH ROW EXECUTE FUNCTION articles_search_vector_update()
    `);

    await queryRunner.query(`
      UPDATE articles SET search_vector =
        to_tsvector('english',
          coalesce(title, '') || ' ' ||
          coalesce(content, '') || ' ' ||
          coalesce(array_to_string(tags, ' '), '')
        )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_articles_search ON articles USING gin(search_vector)
    `);

    // Trigram indexes for similarity queries
    await queryRunner.query(`
      CREATE INDEX idx_articles_title_trgm ON articles USING gin(title gin_trgm_ops)
    `);

    // Search synonyms table
    await queryRunner.query(`
      CREATE TABLE search_synonyms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        term VARCHAR(200) NOT NULL UNIQUE,
        synonyms TEXT[] NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // Search history table
    await queryRunner.query(`
      CREATE TABLE search_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        query VARCHAR(500) NOT NULL,
        "resultCount" INT NOT NULL DEFAULT 0,
        "searchedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_search_history_user ON search_history("userId", "searchedAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_search_history_user`);
    await queryRunner.query(`DROP TABLE IF EXISTS search_history`);
    await queryRunner.query(`DROP TABLE IF EXISTS search_synonyms`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_articles_title_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_articles_search`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS articles_search_vector_trigger ON articles`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS articles_search_vector_update`);
    await queryRunner.query(`ALTER TABLE articles DROP COLUMN IF EXISTS search_vector`);
  }
}
