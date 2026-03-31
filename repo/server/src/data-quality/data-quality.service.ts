import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { DuplicateCandidate } from './entities/duplicate-candidate.entity';
import { EntityMapping } from './entities/entity-mapping.entity';
import { DuplicateCandidateStatus } from '../common/enums/duplicate-candidate-status.enum';

const FUZZY_THRESHOLD = 0.90;
const AUTO_MERGE_THRESHOLD = 0.97;

export interface DataQualityIssue {
  type:
    | 'MISSING_SUPPLIER_EMAIL'
    | 'MISSING_PAYMENT_TERMS'
    | 'DUPLICATE_SUPPLIER'
    | 'OUTLIER_PRICING';
  entityType: string;
  entityId: string;
  label: string;
  detail: string;
}

export interface DataQualityReport {
  checkedAt: Date;
  issues: DataQualityIssue[];
  counts: {
    missingEmail: number;
    missingPaymentTerms: number;
    duplicateSuppliers: number;
    outlierPricing: number;
  };
}

@Injectable()
export class DataQualityService {
  private readonly logger = new Logger(DataQualityService.name);
  private lastReport: DataQualityReport | null = null;

  constructor(
    @InjectRepository(DuplicateCandidate)
    private readonly dupRepo: Repository<DuplicateCandidate>,
    @InjectRepository(EntityMapping)
    private readonly mappingRepo: Repository<EntityMapping>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Fingerprint ───────────────────────────────────────────────────────────

  generateFingerprint(parts: (string | null | undefined)[]): string {
    return parts
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
      .map((p) =>
        p
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .join('|');
  }

  // ── Duplicate detection ───────────────────────────────────────────────────

  /**
   * Checks for duplicates for a single entity.
   * When called inside a transaction (e.g., from runDedupScan), pass the
   * EntityManager so writes participate in the transaction and are rolled back
   * atomically on failure.
   */
  async checkForDuplicates(
    entityType: 'Supplier' | 'Article',
    id: string,
    fingerprint: string,
    manager?: EntityManager,
  ): Promise<void> {
    if (!fingerprint) return;

    const table = entityType === 'Supplier' ? 'suppliers' : 'articles';
    const db = manager ?? this.dataSource;
    const dupRepo = manager
      ? manager.getRepository(DuplicateCandidate)
      : this.dupRepo;

    const rows: Array<{ id: string; score: string }> = await db.query(
      `
      SELECT id, similarity(fingerprint, $1) AS score
      FROM ${table}
      WHERE id != $2
        AND fingerprint IS NOT NULL
        AND similarity(fingerprint, $1) >= $3
      ORDER BY score DESC
      LIMIT 10
      `,
      [fingerprint, id, FUZZY_THRESHOLD],
    );

    for (const row of rows) {
      const score = parseFloat(row.score);
      // Canonical pair ordering (smaller UUID first) prevents duplicate pairs
      const [sourceId, targetId] = id < row.id ? [id, row.id] : [row.id, id];

      const existing = await dupRepo.findOne({
        where: { entityType, sourceId, targetId },
      });

      if (existing) {
        // Update score if improved
        if (score > Number(existing.similarityScore)) {
          await dupRepo.update(existing.id, {
            similarityScore: score,
            isAutoMergeCandidate: score >= AUTO_MERGE_THRESHOLD,
            status:
              existing.status === DuplicateCandidateStatus.DISMISSED
                ? DuplicateCandidateStatus.DISMISSED
                : DuplicateCandidateStatus.PENDING_REVIEW,
          });
        }
        continue;
      }

      await dupRepo.save({
        entityType,
        sourceId,
        targetId,
        similarityScore: score,
        isAutoMergeCandidate: score >= AUTO_MERGE_THRESHOLD,
        status: DuplicateCandidateStatus.PENDING_REVIEW,
      });

      this.logger.log(
        `Duplicate candidate: ${entityType} ${sourceId} ↔ ${targetId} (${(score * 100).toFixed(1)}%)`,
      );
    }
  }

  // ── Merge ─────────────────────────────────────────────────────────────────

  async mergeDuplicate(candidateId: string, adminId: string): Promise<void> {
    const candidate = await this.dupRepo.findOne({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundException('Duplicate candidate not found');
    if (candidate.status !== DuplicateCandidateStatus.PENDING_REVIEW) {
      throw new BadRequestException(`Candidate is already ${candidate.status}`);
    }

    // sourceId = primary (kept), targetId = secondary (soft-deleted)
    const primaryId = candidate.sourceId;
    const secondaryId = candidate.targetId;

    await this.dataSource.transaction(async (manager) => {
      if (candidate.entityType === 'Supplier') {
        await this.mergeSuppliers(manager, primaryId, secondaryId);
      } else if (candidate.entityType === 'Article') {
        await this.mergeArticles(manager, primaryId, secondaryId);
      }

      // Record the mapping
      await manager.save(EntityMapping, {
        entityType: candidate.entityType,
        oldId: secondaryId,
        newId: primaryId,
        mergedBy: adminId,
      });

      // Mark candidate as merged
      await manager.update(DuplicateCandidate, candidateId, {
        status: DuplicateCandidateStatus.MERGED,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      });

      // Dismiss other candidates that involve the secondary record
      await manager
        .createQueryBuilder()
        .update(DuplicateCandidate)
        .set({
          status: DuplicateCandidateStatus.DISMISSED,
          reviewedBy: adminId,
          reviewedAt: new Date(),
        })
        .where(
          '("sourceId" = :sid OR "targetId" = :sid) AND status = :status AND id != :cid',
          {
            sid: secondaryId,
            status: DuplicateCandidateStatus.PENDING_REVIEW,
            cid: candidateId,
          },
        )
        .execute();
    });
  }

  private async mergeSuppliers(
    manager: EntityManager,
    primaryId: string,
    secondaryId: string,
  ): Promise<void> {
    // Rewire FKs to primary
    await manager.query(
      `UPDATE purchase_requests SET "supplierId" = $1 WHERE "supplierId" = $2`,
      [primaryId, secondaryId],
    );
    await manager.query(
      `UPDATE purchase_orders SET "supplierId" = $1 WHERE "supplierId" = $2`,
      [primaryId, secondaryId],
    );
    await manager.query(
      `UPDATE return_authorizations SET "supplierId" = $1 WHERE "supplierId" = $2`,
      [primaryId, secondaryId],
    );
    await manager.query(
      `UPDATE funds_ledger_entries SET "supplierId" = $1 WHERE "supplierId" = $2`,
      [primaryId, secondaryId],
    );
    // Soft-delete secondary
    await manager.query(`UPDATE suppliers SET "isActive" = false WHERE id = $1`, [secondaryId]);
  }

  private async mergeArticles(
    manager: EntityManager,
    primaryId: string,
    secondaryId: string,
  ): Promise<void> {
    // Rewire FKs to primary
    await manager.query(
      `UPDATE article_versions SET "articleId" = $1 WHERE "articleId" = $2`,
      [primaryId, secondaryId],
    );
    // Upsert favorites (avoid PK conflict: skip if user already favorited primary)
    await manager.query(
      `INSERT INTO user_favorites ("userId", "articleId", "createdAt")
       SELECT "userId", $1, "createdAt"
       FROM user_favorites
       WHERE "articleId" = $2
         AND "userId" NOT IN (SELECT "userId" FROM user_favorites WHERE "articleId" = $1)`,
      [primaryId, secondaryId],
    );
    await manager.query(`DELETE FROM user_favorites WHERE "articleId" = $1`, [secondaryId]);
    // Archive secondary
    await manager.query(`UPDATE articles SET status = 'ARCHIVED' WHERE id = $1`, [secondaryId]);
  }

  // ── Dismiss ───────────────────────────────────────────────────────────────

  async dismissDuplicate(candidateId: string, adminId: string): Promise<void> {
    const candidate = await this.dupRepo.findOne({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundException('Duplicate candidate not found');
    if (candidate.status !== DuplicateCandidateStatus.PENDING_REVIEW) {
      throw new BadRequestException(`Candidate is already ${candidate.status}`);
    }
    await this.dupRepo.update(candidateId, {
      status: DuplicateCandidateStatus.DISMISSED,
      reviewedBy: adminId,
      reviewedAt: new Date(),
    });
  }

  // ── Query duplicates ──────────────────────────────────────────────────────

  async getDuplicates(
    status?: string,
    entityType?: string,
  ): Promise<DuplicateCandidate[]> {
    const qb = this.dupRepo
      .createQueryBuilder('dc')
      .leftJoinAndSelect('dc.reviewer', 'reviewer')
      .orderBy('dc.similarityScore', 'DESC')
      .addOrderBy('dc.createdAt', 'DESC');

    if (status) qb.andWhere('dc.status = :status', { status });
    if (entityType) qb.andWhere('dc.entityType = :entityType', { entityType });

    return qb.getMany();
  }

  async getDuplicateWithDetails(id: string): Promise<{
    candidate: DuplicateCandidate;
    source: Record<string, unknown> | null;
    target: Record<string, unknown> | null;
  }> {
    const candidate = await this.dupRepo.findOne({ where: { id } });
    if (!candidate) throw new NotFoundException('Duplicate candidate not found');

    const table = candidate.entityType === 'Supplier' ? 'suppliers' : 'articles';
    const columns =
      candidate.entityType === 'Supplier'
        ? 'id, name, "contactName", email, phone, address, "paymentTerms", "isActive", fingerprint'
        : 'id, title, slug, category, status, tags, fingerprint, "updatedAt"';

    const [source] = await this.dataSource.query(
      `SELECT ${columns} FROM ${table} WHERE id = $1`,
      [candidate.sourceId],
    );
    const [target] = await this.dataSource.query(
      `SELECT ${columns} FROM ${table} WHERE id = $1`,
      [candidate.targetId],
    );

    return {
      candidate,
      source: source ?? null,
      target: target ?? null,
    };
  }

  // ── Data quality checks ───────────────────────────────────────────────────

  async runQualityChecks(): Promise<DataQualityReport> {
    this.logger.log('Running data quality checks…');
    const issues: DataQualityIssue[] = [];

    // 1. Suppliers missing email
    const missingEmail: Array<{ id: string; name: string }> = await this.dataSource.query(
      `SELECT id, name FROM suppliers WHERE "isActive" = true AND (email IS NULL OR email = '')`,
    );
    for (const s of missingEmail) {
      issues.push({
        type: 'MISSING_SUPPLIER_EMAIL',
        entityType: 'Supplier',
        entityId: s.id,
        label: s.name,
        detail: 'Supplier is missing an email address.',
      });
    }

    // 2. Suppliers missing payment terms (null or default is fine; flag if customTermsDescription is non-null but paymentTerms is null)
    //    Actually per spec: "Missing required fields: email, payment terms"
    //    Since paymentTerms has a DB default, let's flag suppliers where paymentTerms is NULL
    const missingPaymentTerms: Array<{ id: string; name: string }> = await this.dataSource.query(
      `SELECT id, name FROM suppliers WHERE "isActive" = true AND "paymentTerms" IS NULL`,
    );
    for (const s of missingPaymentTerms) {
      issues.push({
        type: 'MISSING_PAYMENT_TERMS',
        entityType: 'Supplier',
        entityId: s.id,
        label: s.name,
        detail: 'Supplier is missing payment terms.',
      });
    }

    // 3. Duplicate suppliers by name similarity (not already flagged by fingerprint dedup)
    const dupSuppliers: Array<{ id1: string; name1: string; id2: string; name2: string; score: string }> =
      await this.dataSource.query(`
        SELECT
          s1.id AS id1, s1.name AS name1,
          s2.id AS id2, s2.name AS name2,
          similarity(s1.name, s2.name) AS score
        FROM suppliers s1
        JOIN suppliers s2 ON s1.id < s2.id
        WHERE s1."isActive" = true AND s2."isActive" = true
          AND similarity(s1.name, s2.name) >= 0.80
        ORDER BY score DESC
        LIMIT 20
      `);
    for (const d of dupSuppliers) {
      issues.push({
        type: 'DUPLICATE_SUPPLIER',
        entityType: 'Supplier',
        entityId: d.id1,
        label: `${d.name1} / ${d.name2}`,
        detail: `Name similarity: ${(parseFloat(d.score) * 100).toFixed(1)}%. Possible duplicate with supplier ${d.id2}.`,
      });
    }

    // 4. Outlier pricing: PO line items with unit price > 3× median for the same description
    const outliers: Array<{ id: string; description: string; unitPrice: string; median: string; poId: string }> =
      await this.dataSource.query(`
        WITH medians AS (
          SELECT
            description,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "unitPrice") AS median_price
          FROM purchase_order_line_items
          GROUP BY description
          HAVING COUNT(*) >= 2
        )
        SELECT li.id, li.description, li."unitPrice", li."poId", m.median_price AS median
        FROM purchase_order_line_items li
        JOIN medians m ON m.description = li.description
        WHERE li."unitPrice" > m.median_price * 3
        ORDER BY (li."unitPrice" / m.median_price) DESC
        LIMIT 50
      `);
    for (const o of outliers) {
      issues.push({
        type: 'OUTLIER_PRICING',
        entityType: 'PurchaseOrderLineItem',
        entityId: o.id,
        label: o.description,
        detail: `Unit price $${parseFloat(o.unitPrice).toFixed(2)} is ${(parseFloat(o.unitPrice) / parseFloat(o.median)).toFixed(1)}× the median ($${parseFloat(o.median).toFixed(2)}) on PO ${o.poId}.`,
      });
    }

    const report: DataQualityReport = {
      checkedAt: new Date(),
      issues,
      counts: {
        missingEmail: missingEmail.length,
        missingPaymentTerms: missingPaymentTerms.length,
        duplicateSuppliers: dupSuppliers.length,
        outlierPricing: outliers.length,
      },
    };

    this.lastReport = report;
    this.logger.log(`Data quality check complete: ${issues.length} issue(s) found.`);
    return report;
  }

  async getLastQualityReport(): Promise<DataQualityReport | null> {
    return this.lastReport;
  }

  // ── Full dedup scan ───────────────────────────────────────────────────────

  /**
   * Runs a full dedup scan wrapped in a single database transaction.
   * If any write fails, the entire scan for this attempt is rolled back,
   * preventing partial writes that could corrupt duplicate-candidate state
   * across retry attempts.
   */
  async runDedupScan(): Promise<void> {
    this.logger.log('Running full dedup scan…');

    let supplierCount = 0;
    let articleCount = 0;

    await this.dataSource.transaction(async (manager) => {
      // Scan suppliers that have a fingerprint
      const suppliers: Array<{ id: string; fingerprint: string }> = await manager.query(
        `SELECT id, fingerprint FROM suppliers WHERE fingerprint IS NOT NULL AND "isActive" = true`,
      );
      supplierCount = suppliers.length;
      for (const s of suppliers) {
        await this.checkForDuplicates('Supplier', s.id, s.fingerprint, manager);
      }

      // Scan articles that have a fingerprint
      const articles: Array<{ id: string; fingerprint: string }> = await manager.query(
        `SELECT id, fingerprint FROM articles WHERE fingerprint IS NOT NULL AND status != 'ARCHIVED'`,
      );
      articleCount = articles.length;
      for (const a of articles) {
        await this.checkForDuplicates('Article', a.id, a.fingerprint, manager);
      }
    });

    this.logger.log(
      `Dedup scan complete: checked ${supplierCount} suppliers, ${articleCount} articles.`,
    );
  }

  async getPendingCount(): Promise<number> {
    return this.dupRepo.count({ where: { status: DuplicateCandidateStatus.PENDING_REVIEW } });
  }
}
