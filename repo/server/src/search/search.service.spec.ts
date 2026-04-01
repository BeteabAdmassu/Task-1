/**
 * Unit tests for SearchService.
 *
 * Covers:
 *  - search() SQL uses only columns that exist in the users table (username, not firstName/lastName)
 *  - Specialist draft visibility in search matches article listing/detail policy
 *  - Admin sees non-archived articles
 *  - Other roles only see STOREWIDE + own DRAFTs
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SearchService } from './search.service';
import { SearchSynonym } from './entities/search-synonym.entity';
import { SearchHistory } from './entities/search-history.entity';
import { Article } from '../knowledge-base/entities/article.entity';
import { Role } from '../common/enums/role.enum';
import { ArticleStatus } from '../common/enums/article-status.enum';

describe('SearchService', () => {
  let service: SearchService;
  let dataSourceQuerySpy: jest.Mock;

  const synonymQb = {
    where: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  const synonymRepo = {
    createQueryBuilder: jest.fn(() => synonymQb),
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const historyRepo = {
    save: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  };

  const articleRepo = {
    findOne: jest.fn(),
  };

  const dataSource = {
    query: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: getRepositoryToken(SearchSynonym), useValue: synonymRepo },
        { provide: getRepositoryToken(SearchHistory), useValue: historyRepo },
        { provide: getRepositoryToken(Article), useValue: articleRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    dataSourceQuerySpy = dataSource.query;
    jest.clearAllMocks();
  });

  // ── SQL schema correctness ─────────────────────────────────────────────

  describe('search SQL schema alignment', () => {
    it('selects u.username (not firstName/lastName) from the users table', async () => {
      dataSource.query.mockResolvedValue([]);
      synonymQb.getMany.mockResolvedValue([]);

      await service.search('u1', Role.ADMINISTRATOR, 'potting');

      // First call is the search query; subsequent calls are history pruning
      expect(dataSourceQuerySpy).toHaveBeenCalled();
      const sql: string = dataSourceQuerySpy.mock.calls[0][0];

      // Must select username
      expect(sql).toContain('u.username');
      // Must NOT select firstName or lastName (they don't exist)
      expect(sql).not.toContain('firstName');
      expect(sql).not.toContain('lastName');
    });

    it('maps author field with username (not firstName/lastName)', async () => {
      dataSource.query.mockResolvedValue([
        {
          id: 'a1',
          title: 'Test',
          slug: 'test',
          category: 'GENERAL',
          status: 'STOREWIDE',
          tags: [],
          updatedAt: new Date(),
          authorId: 'u1',
          authorUsername: 'alice',
          rank: '0.5',
          headline: 'test',
        },
      ]);
      synonymQb.getMany.mockResolvedValue([]);

      const result = await service.search('u1', Role.ADMINISTRATOR, 'test');

      expect(result.data).toHaveLength(1);
      expect(result.data[0].author).toEqual({ id: 'u1', username: 'alice' });
    });
  });

  // ── Specialist draft visibility in search ──────────────────────────────

  describe('specialist draft visibility in search', () => {
    it('specialist visibility clause includes DRAFT without author restriction', async () => {
      dataSource.query.mockResolvedValue([]);
      synonymQb.getMany.mockResolvedValue([]);

      await service.search('spec-1', Role.PLANT_CARE_SPECIALIST, 'potting');

      const sql: string = dataSourceQuerySpy.mock.calls[0][0];
      const params: unknown[] = dataSourceQuerySpy.mock.calls[0][1];

      // The visibility clause should include DRAFT status
      expect(params).toContain(ArticleStatus.DRAFT);
      // But should NOT include the userId as an author restriction
      // (specialist sees ALL drafts, not just their own)
      expect(params).not.toContain('spec-1');
      // Confirm the three statuses are present
      expect(params).toContain(ArticleStatus.STOREWIDE);
      expect(params).toContain(ArticleStatus.SPECIALIST_ONLY);
    });

    it('other roles restrict DRAFT to own authorId', async () => {
      dataSource.query.mockResolvedValue([]);
      synonymQb.getMany.mockResolvedValue([]);

      await service.search('clerk-1', Role.WAREHOUSE_CLERK, 'potting');

      const params: unknown[] = dataSourceQuerySpy.mock.calls[0][1];

      // WAREHOUSE_CLERK should have userId in params (author restriction on DRAFT)
      expect(params).toContain('clerk-1');
      expect(params).toContain(ArticleStatus.STOREWIDE);
      expect(params).toContain(ArticleStatus.DRAFT);
    });

    it('admin visibility excludes only ARCHIVED', async () => {
      dataSource.query.mockResolvedValue([]);
      synonymQb.getMany.mockResolvedValue([]);

      await service.search('admin-1', Role.ADMINISTRATOR, 'potting');

      const params: unknown[] = dataSourceQuerySpy.mock.calls[0][1];

      expect(params).toContain(ArticleStatus.ARCHIVED);
      // Admin doesn't have userId in visibility params
      expect(params).not.toContain('admin-1');
    });
  });

  // ── findSimilar visibility ──────────────────────────────────────────────

  describe('findSimilar specialist visibility', () => {
    it('includes DRAFT status for specialists', async () => {
      articleRepo.findOne.mockResolvedValue({
        id: 'a1',
        title: 'Test',
        tags: ['demo'],
      });
      dataSource.query.mockResolvedValue([]);

      await service.findSimilar('a1', 'spec-1', Role.PLANT_CARE_SPECIALIST);

      const sql: string = dataSourceQuerySpy.mock.calls[0][0];
      expect(sql).toContain(ArticleStatus.DRAFT);
    });
  });

  // ── Empty query ─────────────────────────────────────────────────────────

  describe('empty query handling', () => {
    it('returns empty result for blank query', async () => {
      const result = await service.search('u1', Role.ADMINISTRATOR, '');
      expect(result).toEqual({ data: [], total: 0, expandedTerms: [] });
      expect(dataSourceQuerySpy).not.toHaveBeenCalled();
    });

    it('returns empty result for whitespace-only query', async () => {
      const result = await service.search('u1', Role.ADMINISTRATOR, '   ');
      expect(result).toEqual({ data: [], total: 0, expandedTerms: [] });
    });
  });
});
