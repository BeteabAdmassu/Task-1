/**
 * DB-backed integration test for `GET /api/articles/search`.
 *
 * Unlike `search.integration.spec.ts` (which mocks SearchService), this test
 * boots a real NestJS app connected to the live PostgreSQL database.  The raw
 * SQL inside `SearchService.search()` — including the `search_vector` column,
 * `ts_rank`, `ts_headline`, visibility clauses, and the `LEFT JOIN users u`
 * selecting `u.username` — is executed against real schema/migrations.
 *
 * Prerequisites:
 *   - PostgreSQL running with `greenleaf_db` and all migrations applied
 *     (server boots with `migrationsRun: true` so this is automatic).
 *
 * Data isolation:
 *   - Test inserts rows with a unique prefix/tag and cleans them up in
 *     afterAll, so it is safe to run alongside demo-seeded data.
 */

// JWT_SECRET must be set before NestJS modules read it.
const TEST_JWT_SECRET =
  process.env.JWT_SECRET || 'db-integration-test-secret-long-enough-32!!';
process.env.JWT_SECRET = TEST_JWT_SECRET;

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
import { User } from '../../../server/src/users/user.entity';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';
import { typeOrmConfig } from '../../../server/src/config/typeorm.config';

// ── Unique tag to isolate this test run's data ──────────────────────────────

const RUN_TAG = `dbint_${Date.now()}`;

// ── Suite ────────────────────────────────────────────────────────────────────

describe('Search — DB-backed integration (real SQL path)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  // IDs populated during seed, cleaned up in afterAll
  const ids: {
    adminId?: string;
    specAId?: string;
    specBId?: string;
    clerkId?: string;
    supplierId?: string;
    draftArticleId?: string;
    storewideArticleId?: string;
    specialistOnlyArticleId?: string;
    archivedArticleId?: string;
  } = {};

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          ...typeOrmConfig,
          // The same DB used by the running server; migrations already applied.
          migrationsRun: true, // run on each fresh-DB test invocation
        }),
        TypeOrmModule.forFeature([SearchSynonym, SearchHistory, Article, User]),
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [SearchController],
      providers: [
        SearchService, // ← REAL service, NOT mocked
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = module.createNestApplication();
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

    ds = module.get(DataSource);
    jwtService = module.get(JwtService);

    // ── Seed test data ──────────────────────────────────────────────────────

    const qr = ds.createQueryRunner();
    await qr.connect();

    try {
      // Users — one per role needed
      const insertUser = async (
        username: string,
        role: string,
      ): Promise<string> => {
        const rows = await qr.query(
          `INSERT INTO users (username, "passwordHash", role, "isActive", "mustChangePassword")
           VALUES ($1, 'not-a-real-hash', $2, true, false)
           RETURNING id`,
          [username, role],
        );
        return rows[0].id as string;
      };

      ids.adminId = await insertUser(`${RUN_TAG}_admin`, 'ADMINISTRATOR');
      ids.specAId = await insertUser(`${RUN_TAG}_specA`, 'PLANT_CARE_SPECIALIST');
      ids.specBId = await insertUser(`${RUN_TAG}_specB`, 'PLANT_CARE_SPECIALIST');
      ids.clerkId = await insertUser(`${RUN_TAG}_clerk`, 'WAREHOUSE_CLERK');
      ids.supplierId = await insertUser(`${RUN_TAG}_supplier`, 'SUPPLIER');

      // Articles — the search term "xerophyte" is unusual enough to avoid
      // colliding with demo seed data.
      const insertArticle = async (
        slug: string,
        title: string,
        content: string,
        status: string,
        authorId: string,
      ): Promise<string> => {
        const rows = await qr.query(
          `INSERT INTO articles (slug, title, content, category, status, tags, "authorId")
           VALUES ($1, $2, $3, 'CARE_GUIDE', $4, $5, $6)
           RETURNING id`,
          [slug, title, content, status, `{${RUN_TAG}}`, authorId],
        );
        return rows[0].id as string;
      };

      ids.draftArticleId = await insertArticle(
        `${RUN_TAG}-draft`,
        'Xerophyte Watering Guide — Draft',
        'Detailed xerophyte care instructions for arid environments.',
        'DRAFT',
        ids.specAId,
      );

      ids.storewideArticleId = await insertArticle(
        `${RUN_TAG}-storewide`,
        'Xerophyte Propagation Tips',
        'How to propagate xerophyte species in a nursery.',
        'STOREWIDE',
        ids.specAId,
      );

      ids.specialistOnlyArticleId = await insertArticle(
        `${RUN_TAG}-specialist`,
        'Advanced Xerophyte Diseases',
        'Specialist-only guide to xerophyte disease management.',
        'SPECIALIST_ONLY',
        ids.specAId,
      );

      ids.archivedArticleId = await insertArticle(
        `${RUN_TAG}-archived`,
        'Xerophyte Obsolete Guide',
        'This xerophyte guide has been archived.',
        'ARCHIVED',
        ids.specAId,
      );
    } finally {
      await qr.release();
    }
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────

  afterAll(async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      // Delete in FK-safe order
      await qr.query(
        `DELETE FROM search_history WHERE "userId" IN (
          SELECT id FROM users WHERE username LIKE $1
        )`,
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

  // ── Helpers ───────────────────────────────────────────────────────────────

  function token(userId: string, role: string) {
    return jwtService.sign({ sub: userId, username: `test-${role}`, role });
  }

  // ── Tests ─────────────────────────────────────────────────────────────────

  describe('ADMINISTRATOR search', () => {
    it('returns 200 and includes non-archived articles matching the query', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/articles/search?q=xerophyte')
        .set('Authorization', `Bearer ${token(ids.adminId!, Role.ADMINISTRATOR)}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);

      const returnedIds = res.body.data.map((r: { id: string }) => r.id);
      expect(returnedIds).toContain(ids.draftArticleId);
      expect(returnedIds).toContain(ids.storewideArticleId);
      expect(returnedIds).toContain(ids.specialistOnlyArticleId);
      // ARCHIVED must be excluded
      expect(returnedIds).not.toContain(ids.archivedArticleId);
    });

    it('response author shape has username, not firstName/lastName', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/articles/search?q=xerophyte')
        .set('Authorization', `Bearer ${token(ids.adminId!, Role.ADMINISTRATOR)}`);

      expect(res.status).toBe(200);
      const withAuthor = res.body.data.find(
        (r: { author: unknown }) => r.author !== null,
      );
      expect(withAuthor).toBeDefined();
      expect(withAuthor.author).toHaveProperty('username');
      expect(withAuthor.author).toHaveProperty('id');
      expect(withAuthor.author).not.toHaveProperty('firstName');
      expect(withAuthor.author).not.toHaveProperty('lastName');
    });
  });

  describe('PLANT_CARE_SPECIALIST B (draft collaboration)', () => {
    it('can see DRAFT article authored by Specialist A', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/articles/search?q=xerophyte')
        .set(
          'Authorization',
          `Bearer ${token(ids.specBId!, Role.PLANT_CARE_SPECIALIST)}`,
        );

      expect(res.status).toBe(200);

      const returnedIds = res.body.data.map((r: { id: string }) => r.id);
      expect(returnedIds).toContain(ids.draftArticleId);
      expect(returnedIds).toContain(ids.storewideArticleId);
      expect(returnedIds).toContain(ids.specialistOnlyArticleId);
      expect(returnedIds).not.toContain(ids.archivedArticleId);
    });
  });

  describe('WAREHOUSE_CLERK (non-specialist staff)', () => {
    it('does NOT see another user DRAFT article', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/articles/search?q=xerophyte')
        .set(
          'Authorization',
          `Bearer ${token(ids.clerkId!, Role.WAREHOUSE_CLERK)}`,
        );

      expect(res.status).toBe(200);

      const returnedIds = res.body.data.map((r: { id: string }) => r.id);
      // Clerk should see STOREWIDE only (not DRAFT by spec-A, not SPECIALIST_ONLY)
      expect(returnedIds).toContain(ids.storewideArticleId);
      expect(returnedIds).not.toContain(ids.draftArticleId);
      expect(returnedIds).not.toContain(ids.specialistOnlyArticleId);
      expect(returnedIds).not.toContain(ids.archivedArticleId);
    });
  });

  describe('auth boundary', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/articles/search?q=xerophyte',
      );
      expect(res.status).toBe(401);
    });

    it('returns 403 for SUPPLIER role', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/articles/search?q=xerophyte')
        .set(
          'Authorization',
          `Bearer ${token(ids.supplierId!, Role.SUPPLIER)}`,
        );
      expect(res.status).toBe(403);
    });
  });
});
