import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDataQuality1700000000013 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // pg_trgm is already enabled from migration 11, but guard anyway
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // ── Fingerprint columns ──────────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE suppliers ADD COLUMN fingerprint TEXT`);
    await queryRunner.query(`ALTER TABLE articles  ADD COLUMN fingerprint TEXT`);

    await queryRunner.query(
      `CREATE INDEX idx_suppliers_fingerprint_trgm ON suppliers USING gin(fingerprint gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_articles_fingerprint_trgm ON articles USING gin(fingerprint gin_trgm_ops)`,
    );

    // ── DuplicateCandidate ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE duplicate_candidate_status_enum AS ENUM (
        'PENDING_REVIEW', 'MERGED', 'DISMISSED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE duplicate_candidates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "entityType" VARCHAR(50) NOT NULL,
        "sourceId" UUID NOT NULL,
        "targetId" UUID NOT NULL,
        "similarityScore" DECIMAL(5,4) NOT NULL,
        "isAutoMergeCandidate" BOOLEAN NOT NULL DEFAULT false,
        status duplicate_candidate_status_enum NOT NULL DEFAULT 'PENDING_REVIEW',
        "reviewedBy" UUID REFERENCES users(id) ON DELETE SET NULL,
        "reviewedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        UNIQUE ("entityType", "sourceId", "targetId")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_dup_candidates_status ON duplicate_candidates(status, "entityType")`,
    );

    // ── EntityMapping ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE entity_mappings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "entityType" VARCHAR(50) NOT NULL,
        "oldId" UUID NOT NULL,
        "newId" UUID NOT NULL,
        "mergedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "mergedBy" UUID REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_entity_mappings_old ON entity_mappings("entityType", "oldId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_entity_mappings_old`);
    await queryRunner.query(`DROP TABLE IF EXISTS entity_mappings`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_dup_candidates_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS duplicate_candidates`);
    await queryRunner.query(`DROP TYPE IF EXISTS duplicate_candidate_status_enum`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_articles_fingerprint_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_suppliers_fingerprint_trgm`);
    await queryRunner.query(`ALTER TABLE articles  DROP COLUMN IF EXISTS fingerprint`);
    await queryRunner.query(`ALTER TABLE suppliers DROP COLUMN IF EXISTS fingerprint`);
  }
}
