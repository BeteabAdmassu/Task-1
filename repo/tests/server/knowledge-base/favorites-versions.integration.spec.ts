/**
 * Real-DB integration tests for Knowledge Base favorites + versions HTTP paths.
 *
 * Covers:
 *   POST   /api/articles/:id/favorite     (204)
 *   DELETE /api/articles/:id/favorite     (204)
 *   GET    /api/articles/:id/favorite     (true/false body)
 *   GET    /api/users/me/favorites        (list of favorited articles)
 *   GET    /api/articles/:id/versions     (list of versions)
 *   GET    /api/articles/:id/versions/:n  (one version)
 *
 * All run against a real NestJS app connected to Postgres via the
 * KnowledgeBaseModule. No service-layer mocking.
 */

const TEST_JWT_SECRET = 'kb-favorites-integration-secret-long-enough-32!!';
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

import { KnowledgeBaseModule } from '../../../server/src/knowledge-base/knowledge-base.module';
import { NotificationsModule } from '../../../server/src/notifications/notifications.module';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';
import { typeOrmConfig } from '../../../server/src/config/typeorm.config';

const RUN_TAG = `kbfav_${Date.now()}`;

describe('Knowledge Base — favorites + versions, real DB', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  const ids: {
    adminId?: string;
    specialistId?: string;
    article1Id?: string;
    article2Id?: string;
  } = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...typeOrmConfig, migrationsRun: true }),
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
        // @Global() — satisfies KnowledgeBaseService's NotificationService dep.
        NotificationsModule,
        KnowledgeBaseModule,
      ],
      providers: [
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
      ids.adminId = await ins(`${RUN_TAG}_admin`, Role.ADMINISTRATOR);
      ids.specialistId = await ins(
        `${RUN_TAG}_spec`,
        Role.PLANT_CARE_SPECIALIST,
      );

      const a1 = await qr.query(
        `INSERT INTO articles (slug, title, content, category, status, tags, "authorId")
         VALUES ($1, $2, 'initial v1 content', 'CARE_GUIDE', 'STOREWIDE', $3, $4)
         RETURNING id`,
        [
          `${RUN_TAG}-alpha`,
          `${RUN_TAG} Alpha`,
          `{${RUN_TAG}}`,
          ids.specialistId,
        ],
      );
      ids.article1Id = a1[0].id as string;

      const a2 = await qr.query(
        `INSERT INTO articles (slug, title, content, category, status, tags, "authorId")
         VALUES ($1, $2, 'beta content', 'CARE_GUIDE', 'STOREWIDE', $3, $4)
         RETURNING id`,
        [
          `${RUN_TAG}-beta`,
          `${RUN_TAG} Beta`,
          `{${RUN_TAG}}`,
          ids.specialistId,
        ],
      );
      ids.article2Id = a2[0].id as string;

      // Seed two versions on article 1 so the versions endpoints have data.
      await qr.query(
        `INSERT INTO article_versions ("articleId", "versionNumber", title, content, "createdBy")
         VALUES ($1, 1, $2, 'initial v1 content', $3),
                ($1, 2, $2, 'updated v2 content', $3)`,
        [ids.article1Id, `${RUN_TAG} Alpha`, ids.specialistId],
      );
    } finally {
      await qr.release();
    }
  });

  afterAll(async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      await qr.query(
        `DELETE FROM user_favorites WHERE "articleId" IN
         (SELECT id FROM articles WHERE tags @> $1)`,
        [`{${RUN_TAG}}`],
      );
      await qr.query(
        `DELETE FROM article_versions WHERE "articleId" IN
         (SELECT id FROM articles WHERE tags @> $1)`,
        [`{${RUN_TAG}}`],
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
  const asAdmin = () => token(ids.adminId!, Role.ADMINISTRATOR);
  const asSpecialist = () =>
    token(ids.specialistId!, Role.PLANT_CARE_SPECIALIST);

  // ── Versions ──────────────────────────────────────────────────────────────

  describe('Versions', () => {
    it('GET /articles/:id/versions returns both seeded versions sorted', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/articles/${ids.article1Id}/versions`)
        .set('Authorization', `Bearer ${asSpecialist()}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      const numbers = res.body.map((v: { versionNumber: number }) => v.versionNumber);
      expect(numbers.sort()).toEqual([1, 2]);
    });

    it('GET /articles/:id/versions/:n returns one specific version', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/articles/${ids.article1Id}/versions/2`)
        .set('Authorization', `Bearer ${asSpecialist()}`);
      expect(res.status).toBe(200);
      expect(res.body.versionNumber).toBe(2);
      expect(res.body.content).toBe('updated v2 content');
    });

    it('400 when :versionNumber is not an integer', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/articles/${ids.article1Id}/versions/not-a-number`)
        .set('Authorization', `Bearer ${asSpecialist()}`);
      expect(res.status).toBe(400);
    });

    it('404 when version number does not exist for the article', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/articles/${ids.article1Id}/versions/999`)
        .set('Authorization', `Bearer ${asSpecialist()}`);
      expect(res.status).toBe(404);
    });

    it('400 when article :id is not a UUID on versions list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/articles/not-a-uuid/versions')
        .set('Authorization', `Bearer ${asSpecialist()}`);
      expect(res.status).toBe(400);
    });

    it('401 without bearer for versions list', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/articles/${ids.article1Id}/versions`,
      );
      expect(res.status).toBe(401);
    });
  });

  // ── Favorites ────────────────────────────────────────────────────────────

  describe('Per-user favorites lifecycle', () => {
    it('GET favorite starts as false; POST makes it true; DELETE makes it false again', async () => {
      // KnowledgeBaseService.isFavorited() returns a plain `boolean`.
      // Express serialises a primitive return as plain text (Content-Type
      // text/html), so supertest exposes it at `res.text`, not `res.body`.
      const parseBoolResponse = (res: {
        body: unknown;
        text: string;
      }): boolean => {
        if (typeof res.body === 'boolean') return res.body;
        return res.text.trim() === 'true';
      };

      const before = await request(app.getHttpServer())
        .get(`/api/articles/${ids.article1Id}/favorite`)
        .set('Authorization', `Bearer ${asSpecialist()}`);
      expect(before.status).toBe(200);
      expect(parseBoolResponse(before)).toBe(false);

      const add = await request(app.getHttpServer())
        .post(`/api/articles/${ids.article1Id}/favorite`)
        .set('Authorization', `Bearer ${asSpecialist()}`);
      expect(add.status).toBe(204);

      const mid = await request(app.getHttpServer())
        .get(`/api/articles/${ids.article1Id}/favorite`)
        .set('Authorization', `Bearer ${asSpecialist()}`);
      expect(parseBoolResponse(mid)).toBe(true);

      const rows = await ds.query(
        `SELECT COUNT(*)::int AS n FROM user_favorites WHERE "userId" = $1 AND "articleId" = $2`,
        [ids.specialistId, ids.article1Id],
      );
      expect(rows[0].n).toBe(1);

      const del = await request(app.getHttpServer())
        .delete(`/api/articles/${ids.article1Id}/favorite`)
        .set('Authorization', `Bearer ${asSpecialist()}`);
      expect(del.status).toBe(204);

      const after = await request(app.getHttpServer())
        .get(`/api/articles/${ids.article1Id}/favorite`)
        .set('Authorization', `Bearer ${asSpecialist()}`);
      expect(parseBoolResponse(after)).toBe(false);
    });

    it('POST is idempotent — favoriting twice is still 204 and produces one row', async () => {
      await request(app.getHttpServer())
        .post(`/api/articles/${ids.article2Id}/favorite`)
        .set('Authorization', `Bearer ${asSpecialist()}`)
        .expect(204);
      await request(app.getHttpServer())
        .post(`/api/articles/${ids.article2Id}/favorite`)
        .set('Authorization', `Bearer ${asSpecialist()}`)
        .expect(204);

      const rows = await ds.query(
        `SELECT COUNT(*)::int AS n FROM user_favorites WHERE "userId" = $1 AND "articleId" = $2`,
        [ids.specialistId, ids.article2Id],
      );
      expect(rows[0].n).toBe(1);
    });

    it('GET /api/users/me/favorites lists only the caller\'s favorites', async () => {
      // specialist has article2 favorited; admin has none. Favorites are
      // isolated by caller so asAdmin should see none of ours.
      const mine = await request(app.getHttpServer())
        .get('/api/users/me/favorites')
        .set('Authorization', `Bearer ${asSpecialist()}`);
      expect(mine.status).toBe(200);
      const isArr = Array.isArray(mine.body)
        ? mine.body
        : (mine.body as { data?: unknown[] }).data ?? [];
      expect(
        (isArr as Array<{ id?: string; articleId?: string }>).some(
          (f) => f.id === ids.article2Id || f.articleId === ids.article2Id,
        ),
      ).toBe(true);

      const theirs = await request(app.getHttpServer())
        .get('/api/users/me/favorites')
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(theirs.status).toBe(200);
      const adminList = Array.isArray(theirs.body)
        ? theirs.body
        : (theirs.body as { data?: unknown[] }).data ?? [];
      expect(
        (adminList as Array<{ id?: string; articleId?: string }>).some(
          (f) => f.id === ids.article2Id || f.articleId === ids.article2Id,
        ),
      ).toBe(false);
    });

    it('400 on POST when article :id is not a UUID', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/articles/not-a-uuid/favorite')
        .set('Authorization', `Bearer ${asSpecialist()}`);
      expect(res.status).toBe(400);
    });

    it('401 on favorites list without bearer', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/users/me/favorites',
      );
      expect(res.status).toBe(401);
    });
  });
});
