import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SearchSynonym } from './entities/search-synonym.entity';
import { SearchHistory } from './entities/search-history.entity';
import { Article } from '../knowledge-base/entities/article.entity';
import { ArticleStatus } from '../common/enums/article-status.enum';
import { Role } from '../common/enums/role.enum';
import { CreateSynonymDto } from './dto/create-synonym.dto';
import { UpdateSynonymDto } from './dto/update-synonym.dto';

export interface SearchResult {
  id: string;
  title: string;
  slug: string;
  category: string;
  status: string;
  tags: string[];
  author: { id: string; username: string } | null;
  headline: string;
  rank: number;
  updatedAt: Date;
}

export interface SimilarArticle {
  id: string;
  title: string;
  slug: string;
  category: string;
  status: string;
  tags: string[];
  score: number;
}

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(SearchSynonym)
    private readonly synonymRepo: Repository<SearchSynonym>,
    @InjectRepository(SearchHistory)
    private readonly historyRepo: Repository<SearchHistory>,
    @InjectRepository(Article)
    private readonly articleRepo: Repository<Article>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Synonym expansion ─────────────────────────────────────────────────────

  private async expandQuery(rawQuery: string): Promise<string[]> {
    const terms = rawQuery
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    const expanded = new Set<string>(terms);
    if (terms.length === 0) return [];

    // Forward lookup: term → synonyms
    const forward = await this.synonymRepo
      .createQueryBuilder('s')
      .where('LOWER(s.term) = ANY(:terms)', { terms })
      .getMany();

    for (const row of forward) {
      row.synonyms.forEach((syn) =>
        syn.toLowerCase().split(/\s+/).filter(Boolean).forEach((t) => expanded.add(t)),
      );
    }

    // Reverse lookup: synonym → term (and all its synonyms)
    const reverse = await this.synonymRepo
      .createQueryBuilder('s')
      .where(
        `EXISTS (SELECT 1 FROM unnest(s.synonyms) syn WHERE LOWER(syn) = ANY(:terms))`,
        { terms },
      )
      .getMany();

    for (const row of reverse) {
      expanded.add(row.term.toLowerCase());
      row.synonyms.forEach((syn) =>
        syn.toLowerCase().split(/\s+/).filter(Boolean).forEach((t) => expanded.add(t)),
      );
    }

    return Array.from(expanded);
  }

  // ── Search ────────────────────────────────────────────────────────────────

  async search(
    userId: string,
    userRole: string,
    q: string,
    category?: string,
    tags?: string,
  ): Promise<{ data: SearchResult[]; total: number; expandedTerms: string[] }> {
    const trimmed = q?.trim() ?? '';
    if (!trimmed) return { data: [], total: 0, expandedTerms: [] };

    const expandedTerms = await this.expandQuery(trimmed);
    if (expandedTerms.length === 0) return { data: [], total: 0, expandedTerms: [] };

    // tsquery: each term with prefix matching, OR-combined
    const tsquery = expandedTerms.map((t) => `${t}:*`).join(' | ');

    const values: unknown[] = [tsquery]; // $1
    let idx = 2;

    // Visibility clause
    let visibilitySql: string;
    if (userRole === Role.ADMINISTRATOR) {
      visibilitySql = `a.status != $${idx++}`;
      values.push(ArticleStatus.ARCHIVED);
    } else if (userRole === Role.PLANT_CARE_SPECIALIST) {
      visibilitySql = `(a.status = $${idx++} OR a.status = $${idx++} OR a.status = $${idx++})`;
      values.push(ArticleStatus.STOREWIDE, ArticleStatus.SPECIALIST_ONLY, ArticleStatus.DRAFT);
    } else {
      visibilitySql = `(a.status = $${idx++} OR (a.status = $${idx++} AND a."authorId" = $${idx++}))`;
      values.push(ArticleStatus.STOREWIDE, ArticleStatus.DRAFT, userId);
    }

    let sql = `
      SELECT
        a.id,
        a.title,
        a.slug,
        a.category,
        a.status,
        a.tags,
        a."updatedAt",
        a."authorId",
        u.username AS "authorUsername",
        ts_rank(a.search_vector, to_tsquery('english', $1)) AS rank,
        ts_headline('english', a.title || ' ' || a.content,
          to_tsquery('english', $1),
          'MaxWords=30, MinWords=10, StartSel=<mark>, StopSel=</mark>'
        ) AS headline
      FROM articles a
      LEFT JOIN users u ON u.id = a."authorId"
      WHERE ${visibilitySql}
        AND a.search_vector @@ to_tsquery('english', $1)
    `;

    if (category) {
      sql += ` AND a.category = $${idx++}`;
      values.push(category);
    }

    if (tags) {
      sql += ` AND $${idx++} = ANY(a.tags)`;
      values.push(tags);
    }

    sql += ` ORDER BY rank DESC, a."updatedAt" DESC LIMIT 50`;

    const rows: Record<string, unknown>[] = await this.dataSource.query(sql, values);

    const data: SearchResult[] = rows.map((r) => ({
      id: r['id'] as string,
      title: r['title'] as string,
      slug: r['slug'] as string,
      category: r['category'] as string,
      status: r['status'] as string,
      tags: r['tags'] as string[],
      author: r['authorId']
        ? {
            id: r['authorId'] as string,
            username: (r['authorUsername'] as string) ?? '',
          }
        : null,
      headline: r['headline'] as string,
      rank: parseFloat(r['rank'] as string),
      updatedAt: r['updatedAt'] as Date,
    }));

    // Save history non-blocking
    this.saveHistory(userId, trimmed, data.length).catch(() => undefined);

    return { data, total: data.length, expandedTerms };
  }

  // ── Similar articles ──────────────────────────────────────────────────────

  async findSimilar(
    articleId: string,
    userId: string,
    userRole: string,
  ): Promise<SimilarArticle[]> {
    const article = await this.articleRepo.findOne({ where: { id: articleId } });
    if (!article) throw new NotFoundException('Article not found');

    let visibilitySql: string;
    if (userRole === Role.ADMINISTRATOR) {
      visibilitySql = `a.status != '${ArticleStatus.ARCHIVED}'`;
    } else if (userRole === Role.PLANT_CARE_SPECIALIST) {
      visibilitySql = `a.status IN ('${ArticleStatus.STOREWIDE}','${ArticleStatus.SPECIALIST_ONLY}','${ArticleStatus.DRAFT}')`;
    } else {
      visibilitySql = `a.status = '${ArticleStatus.STOREWIDE}'`;
    }

    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `
      SELECT
        a.id,
        a.title,
        a.slug,
        a.category,
        a.status,
        a.tags,
        (
          similarity(a.title, $1) * 2.0 +
          (
            SELECT count(*)::float
            FROM unnest(a.tags) t
            WHERE t = ANY($2::text[])
          ) * 1.5
        ) AS score
      FROM articles a
      WHERE a.id != $3
        AND ${visibilitySql}
        AND (
          similarity(a.title, $1) > 0.1
          OR EXISTS (SELECT 1 FROM unnest(a.tags) t WHERE t = ANY($2::text[]))
        )
      ORDER BY score DESC
      LIMIT 5
      `,
      [article.title, article.tags, articleId],
    );

    return rows.map((r) => ({
      id: r['id'] as string,
      title: r['title'] as string,
      slug: r['slug'] as string,
      category: r['category'] as string,
      status: r['status'] as string,
      tags: r['tags'] as string[],
      score: parseFloat(r['score'] as string),
    }));
  }

  // ── Search history ────────────────────────────────────────────────────────

  private async saveHistory(userId: string, query: string, resultCount: number): Promise<void> {
    await this.historyRepo.save({ userId, query, resultCount });
    // Prune to last 50
    await this.dataSource.query(
      `DELETE FROM search_history
       WHERE "userId" = $1
         AND id NOT IN (
           SELECT id FROM search_history
           WHERE "userId" = $1
           ORDER BY "searchedAt" DESC
           LIMIT 50
         )`,
      [userId],
    );
  }

  async getHistory(userId: string, q?: string): Promise<SearchHistory[]> {
    const qb = this.historyRepo
      .createQueryBuilder('h')
      .where('h.userId = :userId', { userId })
      .orderBy('h.searchedAt', 'DESC')
      .limit(50);

    if (q) {
      qb.andWhere('h.query ILIKE :q', { q: `${q}%` });
    }

    return qb.getMany();
  }

  // ── Synonyms CRUD ─────────────────────────────────────────────────────────

  async findAllSynonyms(): Promise<SearchSynonym[]> {
    return this.synonymRepo.find({ order: { term: 'ASC' } });
  }

  async findSynonym(id: string): Promise<SearchSynonym> {
    const s = await this.synonymRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Synonym not found');
    return s;
  }

  async createSynonym(dto: CreateSynonymDto): Promise<SearchSynonym> {
    const existing = await this.synonymRepo.findOne({
      where: { term: dto.term.toLowerCase() },
    });
    if (existing) throw new ConflictException(`Synonym for "${dto.term}" already exists`);
    return this.synonymRepo.save({
      term: dto.term.toLowerCase(),
      synonyms: dto.synonyms.map((s) => s.toLowerCase()),
    });
  }

  async updateSynonym(id: string, dto: UpdateSynonymDto): Promise<SearchSynonym> {
    const s = await this.findSynonym(id);
    if (dto.term !== undefined) s.term = dto.term.toLowerCase();
    if (dto.synonyms !== undefined) s.synonyms = dto.synonyms.map((v) => v.toLowerCase());
    return this.synonymRepo.save(s);
  }

  async deleteSynonym(id: string): Promise<void> {
    await this.findSynonym(id);
    await this.synonymRepo.delete(id);
  }
}
