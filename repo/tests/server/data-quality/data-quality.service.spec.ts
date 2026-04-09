/**
 * Unit tests for DataQualityService — fingerprint generation, duplicate
 * detection (exact + fuzzy), and catalog-level dedup support.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DataQualityService } from '../../../server/src/data-quality/data-quality.service';
import { DuplicateCandidate } from '../../../server/src/data-quality/entities/duplicate-candidate.entity';
import { EntityMapping } from '../../../server/src/data-quality/entities/entity-mapping.entity';
import { DuplicateCandidateStatus } from '../../../server/src/common/enums/duplicate-candidate-status.enum';

describe('DataQualityService', () => {
  let service: DataQualityService;

  const dupRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  };

  const mappingRepo = {
    save: jest.fn(),
  };

  const dataSource = {
    query: jest.fn(),
    transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataQualityService,
        { provide: getRepositoryToken(DuplicateCandidate), useValue: dupRepo },
        { provide: getRepositoryToken(EntityMapping), useValue: mappingRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<DataQualityService>(DataQualityService);
    jest.clearAllMocks();
  });

  // ── Fingerprint generation ──────────────────────────────────────────────

  describe('generateFingerprint', () => {
    it('normalizes and joins parts with pipe separator', () => {
      const fp = service.generateFingerprint(['NPK Fertilizer', 'Demo Supplier', '10kg']);
      expect(fp).toBe('npk fertilizer|demo supplier|10kg');
    });

    it('strips special characters', () => {
      const fp = service.generateFingerprint(['Miracle-Gro™ (20L)']);
      expect(fp).toBe('miracle gro 20l');
    });

    it('skips null and empty parts', () => {
      const fp = service.generateFingerprint(['Title', null, '', undefined, '5kg']);
      expect(fp).toBe('title|5kg');
    });
  });

  // ── Catalog fingerprint includes supplier + unit size + optional UPC ───

  describe('catalog fingerprint composition', () => {
    it('creates normalized fingerprint from title, supplier, unitSize, upc', () => {
      const fp = service.generateFingerprint([
        'Premium Potting Mix',
        'Demo Supplier Inc.',
        '20L bag',
        '012345678901',
      ]);
      expect(fp).toBe('premium potting mix|demo supplier inc|20l bag|012345678901');
    });

    it('works without optional UPC', () => {
      const fp = service.generateFingerprint([
        'Premium Potting Mix',
        'Demo Supplier Inc.',
        '20L bag',
      ]);
      expect(fp).toBe('premium potting mix|demo supplier inc|20l bag');
    });
  });

  // ── checkForDuplicates — exact + fuzzy ────────────────────────────────

  describe('checkForDuplicates', () => {
    it('queries the correct table for Supplier', async () => {
      dataSource.query.mockResolvedValue([]);

      await service.checkForDuplicates('Supplier', 'id-1', 'some fp');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM suppliers'),
        expect.any(Array),
      );
    });

    it('queries the correct table for Article', async () => {
      dataSource.query.mockResolvedValue([]);

      await service.checkForDuplicates('Article', 'id-1', 'some fp');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM articles'),
        expect.any(Array),
      );
    });

    it('queries the correct table for CatalogItem', async () => {
      dataSource.query.mockResolvedValue([]);

      await service.checkForDuplicates('CatalogItem', 'id-1', 'some fp');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM catalog_items'),
        expect.any(Array),
      );
    });

    it('creates a PENDING_REVIEW candidate when a fuzzy match is found', async () => {
      dataSource.query.mockResolvedValue([{ id: 'id-2', score: '0.92' }]);
      dupRepo.findOne.mockResolvedValue(null); // no existing candidate

      await service.checkForDuplicates('CatalogItem', 'id-1', 'potting mix demo supplier');

      expect(dupRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'CatalogItem',
          similarityScore: 0.92,
          isAutoMergeCandidate: false,
          status: DuplicateCandidateStatus.PENDING_REVIEW,
        }),
      );
    });

    it('marks auto-merge when score >= 0.97', async () => {
      dataSource.query.mockResolvedValue([{ id: 'id-2', score: '0.98' }]);
      dupRepo.findOne.mockResolvedValue(null);

      await service.checkForDuplicates('CatalogItem', 'id-1', 'exact same fingerprint');

      expect(dupRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isAutoMergeCandidate: true,
        }),
      );
    });

    it('uses canonical pair ordering (smaller UUID first)', async () => {
      dataSource.query.mockResolvedValue([{ id: 'aaa', score: '0.95' }]);
      dupRepo.findOne.mockResolvedValue(null);

      await service.checkForDuplicates('CatalogItem', 'zzz', 'fp');

      expect(dupRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: 'aaa',
          targetId: 'zzz',
        }),
      );
    });

    it('does nothing when fingerprint is empty', async () => {
      await service.checkForDuplicates('CatalogItem', 'id-1', '');
      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });

  // ── runDedupScan — includes CatalogItem ──────────────────────────────

  describe('runDedupScan', () => {
    it('scans suppliers, articles, and catalog items', async () => {
      // Spy on checkForDuplicates so the actual DB query inside it doesn't fire
      const checkSpy = jest.spyOn(service, 'checkForDuplicates').mockResolvedValue(undefined);

      dataSource.transaction.mockImplementation(async (fn: (m: any) => Promise<void>) => {
        const manager = {
          query: jest.fn()
            .mockResolvedValueOnce([{ id: 's-1', fingerprint: 'sfp' }]) // suppliers
            .mockResolvedValueOnce([{ id: 'a-1', fingerprint: 'afp' }]) // articles
            .mockResolvedValueOnce([{ id: 'cat-1', fingerprint: 'cfp' }]), // catalog items
        };
        await fn(manager);
        // Verify all three entity queries were issued
        expect(manager.query).toHaveBeenCalledTimes(3);
        expect(manager.query).toHaveBeenCalledWith(
          expect.stringContaining('catalog_items'),
        );
      });

      await service.runDedupScan();

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      // Verify checkForDuplicates was called for each entity type
      expect(checkSpy).toHaveBeenCalledWith('Supplier', 's-1', 'sfp', expect.anything());
      expect(checkSpy).toHaveBeenCalledWith('Article', 'a-1', 'afp', expect.anything());
      expect(checkSpy).toHaveBeenCalledWith('CatalogItem', 'cat-1', 'cfp', expect.anything());

      checkSpy.mockRestore();
    });
  });

  // ── getDuplicateWithDetails — CatalogItem columns ────────────────────

  describe('getDuplicateWithDetails', () => {
    it('fetches catalog_items columns for CatalogItem entityType', async () => {
      dupRepo.findOne.mockResolvedValue({
        id: 'dup-1',
        entityType: 'CatalogItem',
        sourceId: 'cat-1',
        targetId: 'cat-2',
      });
      dataSource.query
        .mockResolvedValueOnce([{ id: 'cat-1', title: 'Item A' }])
        .mockResolvedValueOnce([{ id: 'cat-2', title: 'Item B' }]);

      const result = await service.getDuplicateWithDetails('dup-1');

      expect(result.source).toEqual({ id: 'cat-1', title: 'Item A' });
      expect(result.target).toEqual({ id: 'cat-2', title: 'Item B' });
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('catalog_items'),
        ['cat-1'],
      );
    });
  });
});
