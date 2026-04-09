/**
 * Unit tests for SearchService — synonym expansion and search history.
 *
 * Covers the two gaps identified in the audit:
 *
 *   expandedTerms:
 *     ▸ search() returns expandedTerms in the response
 *     ▸ forward lookup: term → synonyms are included in expandedTerms
 *     ▸ reverse lookup: synonym → canonical term is included in expandedTerms
 *     ▸ empty query returns { data:[], total:0, expandedTerms:[] } immediately
 *     ▸ query with no synonym rows returns the original terms only
 *
 *   History limit=50:
 *     ▸ getHistory() delegates correct limit=50 to the query builder
 *     ▸ saveHistory() fires a DELETE to prune to 50 after saving
 *     ▸ getHistory() passes optional prefix-filter when q is supplied
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SearchService } from '../../../server/src/search/search.service';
import { SearchSynonym } from '../../../server/src/search/entities/search-synonym.entity';
import { SearchHistory } from '../../../server/src/search/entities/search-history.entity';
import { Article } from '../../../server/src/knowledge-base/entities/article.entity';
import { Role } from '../../../server/src/common/enums/role.enum';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSynonymRow(term: string, synonyms: string[]): SearchSynonym {
  return { id: term, term, synonyms, createdAt: new Date(), updatedAt: new Date() } as SearchSynonym;
}

function makeQb(overrides: Partial<{
  getMany: () => Promise<SearchSynonym[]>;
  getMany2: () => Promise<SearchSynonym[]>;
  getMany3: () => Promise<SearchHistory[]>;
  getCount: () => Promise<number>;
}> = {}) {
  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn(overrides.getMany ?? (async () => [])),
    getCount: jest.fn(overrides.getCount ?? (async () => 0)),
  };
  return qb;
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('SearchService — expandedTerms and history limit', () => {
  let service: SearchService;

  const synonymQb = makeQb();
  const historyQb = makeQb();

  const synonymRepo = {
    createQueryBuilder: jest.fn(() => synonymQb),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    save: jest.fn(async (d: unknown) => d),
    delete: jest.fn(async () => undefined),
  };

  const historyRepo = {
    createQueryBuilder: jest.fn(() => historyQb),
    save: jest.fn(async (d: unknown) => d),
  };

  const articleRepo = {
    findOne: jest.fn(async () => null),
  };

  const dataSource = {
    query: jest.fn(async () => []),
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
    jest.clearAllMocks();
  });

  // ── expandedTerms ─────────────────────────────────────────────────────────

  describe('expandedTerms in search()', () => {
    it('returns expandedTerms field in every search response', async () => {
      // No synonyms; query builder returns empty lists
      synonymQb.getMany.mockResolvedValue([]);
      dataSource.query.mockResolvedValue([]);

      const result = await service.search('u1', Role.PROCUREMENT_MANAGER, 'fertilizer');

      expect(result).toHaveProperty('expandedTerms');
      expect(Array.isArray(result.expandedTerms)).toBe(true);
    });

    it('returns the original term in expandedTerms when no synonym rows exist', async () => {
      synonymQb.getMany.mockResolvedValue([]);
      dataSource.query.mockResolvedValue([]);

      const result = await service.search('u1', Role.PROCUREMENT_MANAGER, 'aphid');

      expect(result.expandedTerms).toContain('aphid');
    });

    it('forward lookup: adds synonyms of the search term to expandedTerms', async () => {
      // Forward: 'aphid' → ['greenfly', 'plant louse']
      synonymQb.getMany
        .mockResolvedValueOnce([makeSynonymRow('aphid', ['greenfly', 'plant louse'])]) // forward
        .mockResolvedValueOnce([]); // reverse
      dataSource.query.mockResolvedValue([]);

      const result = await service.search('u1', Role.ADMINISTRATOR, 'aphid');

      expect(result.expandedTerms).toContain('aphid');
      expect(result.expandedTerms).toContain('greenfly');
      expect(result.expandedTerms).toContain('plant');
      expect(result.expandedTerms).toContain('louse');
    });

    it('reverse lookup: adds the canonical term when searching by a synonym', async () => {
      // Searching for 'greenfly'; reverse row maps it back to 'aphid'
      synonymQb.getMany
        .mockResolvedValueOnce([])                                            // forward (no match)
        .mockResolvedValueOnce([makeSynonymRow('aphid', ['greenfly'])]);     // reverse
      dataSource.query.mockResolvedValue([]);

      const result = await service.search('u1', Role.PROCUREMENT_MANAGER, 'greenfly');

      expect(result.expandedTerms).toContain('greenfly');
      expect(result.expandedTerms).toContain('aphid');
    });

    it('returns empty result immediately when query is blank', async () => {
      const result = await service.search('u1', Role.PROCUREMENT_MANAGER, '');

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.expandedTerms).toHaveLength(0);
      // Neither the synonym repo nor the DB should be called
      expect(synonymRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('returns empty result immediately when query is whitespace only', async () => {
      const result = await service.search('u1', Role.PROCUREMENT_MANAGER, '   ');

      expect(result.data).toHaveLength(0);
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('deduplicates terms so expandedTerms has no duplicates', async () => {
      // Forward adds 'greenfly'; reverse also resolves back to 'greenfly' via another row
      synonymQb.getMany
        .mockResolvedValueOnce([makeSynonymRow('aphid', ['greenfly'])])
        .mockResolvedValueOnce([makeSynonymRow('whitefly', ['greenfly'])]);
      dataSource.query.mockResolvedValue([]);

      const result = await service.search('u1', Role.ADMINISTRATOR, 'aphid');

      const counts = result.expandedTerms.reduce<Record<string, number>>((acc, t) => {
        acc[t] = (acc[t] ?? 0) + 1;
        return acc;
      }, {});
      for (const [term, count] of Object.entries(counts)) {
        expect(count).toBe(1); // `${term}` appears exactly once
      }
    });
  });

  // ── History limit = 50 ────────────────────────────────────────────────────

  describe('search history limit=50', () => {
    it('getHistory() applies limit(50) on the query builder', async () => {
      historyQb.getMany.mockResolvedValue([]);
      await service.getHistory('u1');

      expect(historyQb.limit).toHaveBeenCalledWith(50);
    });

    it('getHistory() orders by searchedAt DESC', async () => {
      historyQb.getMany.mockResolvedValue([]);
      await service.getHistory('u1');

      expect(historyQb.orderBy).toHaveBeenCalledWith('h.searchedAt', 'DESC');
    });

    it('getHistory() applies prefix filter when q is supplied', async () => {
      historyQb.getMany.mockResolvedValue([]);
      await service.getHistory('u1', 'fert');

      expect(historyQb.andWhere).toHaveBeenCalledWith(
        'h.query ILIKE :q',
        expect.objectContaining({ q: 'fert%' }),
      );
    });

    it('saveHistory() issues a DELETE prune to keep at most 50 entries per user', async () => {
      // Trigger saveHistory via search (it is called non-blocking)
      synonymQb.getMany.mockResolvedValue([]);
      dataSource.query
        .mockResolvedValueOnce([]) // actual search query
        .mockResolvedValueOnce([] as never[]); // DELETE prune

      await service.search('u1', Role.PROCUREMENT_MANAGER, 'soil');

      // Allow the non-blocking saveHistory to complete
      await new Promise((r) => setImmediate(r));

      // The second dataSource.query call must be the DELETE prune with LIMIT 50
      const calls = dataSource.query.mock.calls as unknown as [string, unknown[]][];
      const pruneCall = calls.find(([sql]) =>
        typeof sql === 'string' && sql.includes('DELETE') && sql.includes('LIMIT 50'),
      );
      expect(pruneCall).toBeDefined();
      // Confirm the correct userId is passed to the prune query
      expect(pruneCall![1]).toContain('u1');
    });
  });
});
