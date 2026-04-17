/**
 * Real-DB integration tests for:
 *   GET /api/articles/:id/similar
 *   GET /api/users/me/search-history
 *
 * True no-mock: boots the SearchController with the live SearchService,
 * real articles/search_history tables, and a caller-scoped query.
 */

const TEST_JWT_SECRET = 'search-sim-history-integration-secret-32-chars!';
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.FIELD_ENCRYPTION_KEY =
  process.env.FIELD_ENCRYPTION_KEY ??
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

jest.setTimeout(30_000);

import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { SearchController } from '../../../server/src/search/search.controller';
import { SearchService } from '../../../server/src/search/search.service';
import { SearchSynonym } from '../../../server/src/search/entities/search-synonym.entity';
import { SearchHistory } from '../../../server/src/search/entities/search-history.entity';
import { Article } from '../../../server/src/knowledge-base/entities/article.entity';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';
import { typeOrmConfig } from '../../../server/src/config/typeorm.config';

const RUN_TAG = `srchsh_${Date.now()}`;

describe('Search similar + history — real DB', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  const ids: {
    aliceId?: string;
    bobId?: string;
    clerkId?: string;
    seedArticleId?: string;
    similarArticleId?: string;
    archivedSimilarId?: string;
    unrelatedArticleId?: string;
  } = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...typeOrmConfig, migrationsRun: true }),
        TypeOrmModule.forFeature([SearchSynonym, SearchHistory, Article]),
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [SearchController],
      providers: [
        SearchService,
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    ds = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);

    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const ins = async (u: string, r: string) => {
        const rows = await qr.query(
          `INSERT INTO users (username, "passwordHash", role, "isActive", "mustChangePassword")
           VALUES ($1, 'not-a-real-hash', $2, true, false) RETURNING id`,
          [u, r],
        );
        return rows[0].id as string;
      };
      ids.aliceId = await ins(`${RUN_TAG}_alice`, Role.PLANT_CARE_SPECIALIST);
      ids.bobId = await ins(`${RUN_TAG}_bob`, Role.PLANT_CARE_SPECIALIST);
      ids.clerkId = await ins(`${RUN_TAG}_clerk`, Role.WAREHOUSE_CLERK);

      const insArticle = async (
        slug: string,
        title: string,
        status: string,
        tags: string[],
      ) => {
        const rows = await qr.query(
          `INSERT INTO articles (slug, title, content, category, status, tags, "authorId")
           VALUES ($1, $2, 'body', 'CARE_GUIDE', $3, $4, $5)
           RETURNING id`,
          [slug, title, status, `{${RUN_TAG},${tags.join(',')}}`, ids.aliceId],
        );
        return rows[0].id as string;
      };

      // The seed article: "xerophyte-care-guide-RUN_TAG"
      ids.seedArticleId = await insArticle(
        `${RUN_TAG}-xerophyte-seed`,
        `Xerophyte Care Guide ${RUN_TAG}`,
        'STOREWIDE',
        ['arid', 'succulent'],
      );

      // Strongly similar: same tags + similar title → should appear.
      ids.similarArticleId = await insArticle(
        `${RUN_TAG}-xerophyte-tips`,
        `Xerophyte Watering Tips ${RUN_TAG}`,
        'STOREWIDE',
        ['arid', 'succulent'],
      );

      // Archived similar — MUST be excluded from similar results for all roles.
      ids.archivedSimilarId = await insArticle(
        `${RUN_TAG}-xerophyte-archived`,
        `Xerophyte Old Article ${RUN_TAG}`,
        'ARCHIVED',
        ['arid', 'succulent'],
      );

      // Unrelated — different title and no overlapping tags → should NOT appear.
      ids.unrelatedArticleId = await insArticle(
        `${RUN_TAG}-tomatoes`,
        `Tomato Pruning ${RUN_TAG}`,
        'STOREWIDE',
        ['garden-vegetables'],
      );

      // Seed search history: Alice has 3 entries; Bob has 1.
      const hist = async (userId: string, q: string) => {
        await qr.query(
          `INSERT INTO search_history ("userId", query, "resultCount")
           VALUES ($1, $2, 0)`,
          [userId, q],
        );
      };
      await hist(ids.aliceId!, `${RUN_TAG}-xerophyte`);
      await hist(ids.aliceId!, `${RUN_TAG}-xerophyte watering`);
      await hist(ids.aliceId!, `${RUN_TAG}-succulent`);
      await hist(ids.bobId!, `${RUN_TAG}-tomato`);
    } finally {
      await qr.release();
    }
  });

  afterAll(async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      await qr.query(
        `DELETE FROM search_history WHERE query LIKE $1`,
        [`${RUN_TAG}%`],
      );
      await qr.query(`DELETE FROM articles WHERE tags @> $1`, [
        `{${RUN_TAG}}`,
      ]);
      await qr.query(`DELETE FROM users WHERE username LIKE $1`, [
        `${RUN_TAG}%`,
      ]);
    } finally {
      await qr.release();
    }
    await app.close();
  });

  const token = (userId: string, role: string) =>
    jwtService.sign({ sub: userId, username: `t-${role}`, role });
  const asAlice = () => token(ids.aliceId!, Role.PLANT_CARE_SPECIALIST);
  const asBob = () => token(ids.bobId!, Role.PLANT_CARE_SPECIALIST);
  const asClerk = () => token(ids.clerkId!, Role.WAREHOUSE_CLERK);

  // ── GET /api/articles/:id/similar ────────────────────────────────────────

  describe('GET /api/articles/:id/similar', () => {
    it('401 without bearer', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/articles/${ids.seedArticleId}/similar`,
      );
      expect(res.status).toBe(401);
    });

    it('404 for an unknown article id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/articles/11111111-1111-4111-a111-111111111111/similar')
        .set('Authorization', `Bearer ${asAlice()}`);
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/not found/i);
    });

    it('400 when id is not a UUID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/articles/not-a-uuid/similar')
        .set('Authorization', `Bearer ${asAlice()}`);
      expect(res.status).toBe(400);
    });

    it('returns related articles with a numeric score and excludes ARCHIVED entries', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/articles/${ids.seedArticleId}/similar`)
        .set('Authorization', `Bearer ${asAlice()}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const returnedIds = res.body.map((r: { id: string }) => r.id);

      // Positive invariant: a strongly-overlapping article (same tags + similar
      // title) is returned with a numeric score.
      expect(returnedIds).toContain(ids.similarArticleId);

      // Visibility invariant: ARCHIVED article is NEVER returned, regardless
      // of tag/title match strength. This is the core shipped guarantee.
      expect(returnedIds).not.toContain(ids.archivedSimilarId);

      // Response shape: score is a number, slug+title+status are strings.
      const hit = res.body.find(
        (r: { id: string }) => r.id === ids.similarArticleId,
      );
      expect(hit).toBeDefined();
      expect(typeof hit.score).toBe('number');
      expect(hit.score).toBeGreaterThan(0);
      expect(typeof hit.slug).toBe('string');
      expect(hit.status).toBe('STOREWIDE');
    });

    it('WAREHOUSE_CLERK sees only STOREWIDE similar results (no DRAFT/specialist visibility)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/articles/${ids.seedArticleId}/similar`)
        .set('Authorization', `Bearer ${asClerk()}`);
      expect(res.status).toBe(200);
      expect(
        res.body.every((r: { status: string }) => r.status === 'STOREWIDE'),
      ).toBe(true);
    });
  });

  // ── GET /api/users/me/search-history ─────────────────────────────────────

  describe('GET /api/users/me/search-history', () => {
    it('401 without bearer', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/users/me/search-history',
      );
      expect(res.status).toBe(401);
    });

    it('returns caller\'s own history; does NOT leak another user\'s rows', async () => {
      const a = await request(app.getHttpServer())
        .get('/api/users/me/search-history')
        .set('Authorization', `Bearer ${asAlice()}`);
      expect(a.status).toBe(200);
      expect(Array.isArray(a.body)).toBe(true);

      // Alice has exactly 3 rows tagged with RUN_TAG.
      const aliceOurs = a.body.filter((r: { query: string }) =>
        r.query.startsWith(RUN_TAG),
      );
      expect(aliceOurs.length).toBe(3);
      expect(
        aliceOurs.every((r: { userId: string }) => r.userId === ids.aliceId),
      ).toBe(true);
      // No Bob query leaks into Alice's list.
      expect(
        a.body.some((r: { query: string }) => r.query === `${RUN_TAG}-tomato`),
      ).toBe(false);

      const b = await request(app.getHttpServer())
        .get('/api/users/me/search-history')
        .set('Authorization', `Bearer ${asBob()}`);
      expect(b.status).toBe(200);
      const bobOurs = b.body.filter((r: { query: string }) =>
        r.query.startsWith(RUN_TAG),
      );
      expect(bobOurs.length).toBe(1);
      expect(bobOurs[0].query).toBe(`${RUN_TAG}-tomato`);
    });

    it('q filter applies an ILIKE prefix match scoped to the caller', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/users/me/search-history?q=${RUN_TAG}-xerophyte`)
        .set('Authorization', `Bearer ${asAlice()}`);
      expect(res.status).toBe(200);
      // 2 of Alice's 3 entries start with `${RUN_TAG}-xerophyte`.
      const ours = res.body.filter((r: { query: string }) =>
        r.query.startsWith(`${RUN_TAG}-xerophyte`),
      );
      expect(ours.length).toBe(2);
      // The `${RUN_TAG}-succulent` row is not included.
      expect(
        res.body.some(
          (r: { query: string }) => r.query === `${RUN_TAG}-succulent`,
        ),
      ).toBe(false);
    });

    it('returns results ordered by searchedAt DESC (newest first)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/me/search-history')
        .set('Authorization', `Bearer ${asAlice()}`);
      expect(res.status).toBe(200);
      const times = res.body.map((r: { searchedAt: string }) =>
        new Date(r.searchedAt).getTime(),
      );
      for (let i = 1; i < times.length; i++) {
        expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
      }
    });
  });
});
