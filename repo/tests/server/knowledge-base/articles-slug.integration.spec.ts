/**
 * Real-DB integration tests for GET /api/articles/slug/:slug.
 *
 * True no-mock: full KnowledgeBaseModule → real articles table. Exercises the
 * slug lookup + visibility rules (storewide articles are visible to all
 * internal roles; DRAFT articles are hidden from non-specialists and from
 * specialists other than the author).
 */

const TEST_JWT_SECRET = 'articles-slug-integration-secret-long-enough-32!';
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

const RUN_TAG = `slug_${Date.now()}`;

describe('GET /api/articles/slug/:slug — real DB', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  const ids: {
    adminId?: string;
    specAId?: string;
    specBId?: string;
    clerkId?: string;
    storewideId?: string;
    draftId?: string;
  } = {};
  const slugs = {
    storewide: `${RUN_TAG}-storewide`,
    draft: `${RUN_TAG}-draft`,
  };

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
      ids.specAId = await ins(`${RUN_TAG}_specA`, Role.PLANT_CARE_SPECIALIST);
      ids.specBId = await ins(`${RUN_TAG}_specB`, Role.PLANT_CARE_SPECIALIST);
      ids.clerkId = await ins(`${RUN_TAG}_clerk`, Role.WAREHOUSE_CLERK);

      const insArticle = async (
        slug: string,
        status: string,
        authorId: string,
      ) => {
        const rows = await qr.query(
          `INSERT INTO articles (slug, title, content, category, status, tags, "authorId")
           VALUES ($1, $2, 'body', 'CARE_GUIDE', $3, $4, $5)
           RETURNING id`,
          [slug, slug, status, `{${RUN_TAG}}`, authorId],
        );
        return rows[0].id as string;
      };
      ids.storewideId = await insArticle(
        slugs.storewide,
        'STOREWIDE',
        ids.specAId,
      );
      ids.draftId = await insArticle(slugs.draft, 'DRAFT', ids.specAId);
    } finally {
      await qr.release();
    }
  });

  afterAll(async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
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

  describe('Authentication gate', () => {
    it('401 without bearer', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/articles/slug/${slugs.storewide}`,
      );
      expect(res.status).toBe(401);
    });
  });

  describe('Happy path', () => {
    it('STOREWIDE article returns 200 with full article payload to an ADMINISTRATOR', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/articles/slug/${slugs.storewide}`)
        .set('Authorization', `Bearer ${token(ids.adminId!, Role.ADMINISTRATOR)}`);
      expect(res.status).toBe(200);
      expect(res.body.slug).toBe(slugs.storewide);
      expect(res.body.id).toBe(ids.storewideId);
      expect(res.body.status).toBe('STOREWIDE');
      // Payload is a complete article, not a stub.
      expect(typeof res.body.content).toBe('string');
      expect(res.body.content.length).toBeGreaterThan(0);
    });

    it('STOREWIDE article is visible to non-author roles (WAREHOUSE_CLERK, PROCUREMENT_MANAGER, specialists)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/articles/slug/${slugs.storewide}`)
        .set(
          'Authorization',
          `Bearer ${token(ids.clerkId!, Role.WAREHOUSE_CLERK)}`,
        );
      expect(res.status).toBe(200);
      expect(res.body.slug).toBe(slugs.storewide);
    });
  });

  describe('Visibility gating', () => {
    it('DRAFT article is visible to its author (specialist A) — 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/articles/slug/${slugs.draft}`)
        .set(
          'Authorization',
          `Bearer ${token(ids.specAId!, Role.PLANT_CARE_SPECIALIST)}`,
        );
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('DRAFT');
    });

    it('DRAFT article returns 200 for ADMINISTRATOR', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/articles/slug/${slugs.draft}`)
        .set(
          'Authorization',
          `Bearer ${token(ids.adminId!, Role.ADMINISTRATOR)}`,
        );
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('DRAFT');
    });

    it('DRAFT article is VISIBLE to another specialist (specialists share draft visibility)', async () => {
      // The KB visibility contract for PLANT_CARE_SPECIALIST is
      // { STOREWIDE, SPECIALIST_ONLY, DRAFT } — all specialists see each
      // other's drafts. This is the same rule exercised in
      // `tests/e2e/kb-draft-visibility.spec.ts`.
      const res = await request(app.getHttpServer())
        .get(`/api/articles/slug/${slugs.draft}`)
        .set(
          'Authorization',
          `Bearer ${token(ids.specBId!, Role.PLANT_CARE_SPECIALIST)}`,
        );
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.slug).toBe(slugs.draft);
    });

    it('DRAFT article is HIDDEN from WAREHOUSE_CLERK — 404', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/articles/slug/${slugs.draft}`)
        .set(
          'Authorization',
          `Bearer ${token(ids.clerkId!, Role.WAREHOUSE_CLERK)}`,
        );
      expect(res.status).toBe(404);
    });
  });

  describe('404 for non-existent slug', () => {
    it('returns 404 with an explanatory message', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/articles/slug/${RUN_TAG}-does-not-exist`)
        .set(
          'Authorization',
          `Bearer ${token(ids.adminId!, Role.ADMINISTRATOR)}`,
        );
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/not found/i);
    });
  });
});
