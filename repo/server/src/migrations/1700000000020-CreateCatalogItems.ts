import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCatalogItems1700000000020 implements MigrationInterface {
  name = 'CreateCatalogItems1700000000020';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE catalog_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(300) NOT NULL,
        "supplierId" UUID REFERENCES suppliers(id) ON DELETE SET NULL,
        "unitSize" VARCHAR(100),
        upc VARCHAR(50),
        "unitPrice" DECIMAL(12,2),
        description TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        fingerprint TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_catalog_items_fingerprint_trgm ON catalog_items USING gin(fingerprint gin_trgm_ops)`,
    );

    await queryRunner.query(
      `CREATE INDEX idx_catalog_items_supplier ON catalog_items("supplierId")`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_catalog_items_upc ON catalog_items(upc) WHERE upc IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_catalog_items_upc`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_catalog_items_supplier`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_catalog_items_fingerprint_trgm`);
    await queryRunner.query(`DROP TABLE IF EXISTS catalog_items`);
  }
}
