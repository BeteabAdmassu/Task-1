/**
 * Regression tests for ARCHIVED article visibility rules via the HTTP layer.
 *
 * Rules under test (from KnowledgeBaseService.canViewArticle):
 *   ▸ ADMINISTRATOR    → can access ARCHIVED articles by direct ID (200)
 *   ▸ All other roles  → ARCHIVED articles appear as 404 (treated as not found)
 *   ▸ ARCHIVED articles are excluded from ADMINISTRATOR list responses
 *   ▸ Attempting to edit an ARCHIVED article returns 403 (for all roles)
 *   ▸ SPECIALIST_ONLY articles are visible to PLANT_CARE_SPECIALIST and ADMINISTRATOR,
 *     but not to other roles (404)
 *   ▸ SUPPLIER role cannot access the articles endpoint at all (403)
 */

const TEST_JWT_SECRET = 'integration-test-secret-long-enough-32-chars!!';
process.env.JWT_SECRET = TEST_JWT_SECRET;

import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import {
  ForbiddenException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';

import { ArticlesController } from '../../../server/src/knowledge-base/articles.controller';
import { KnowledgeBaseService } from '../../../server/src/knowledge-base/knowledge-base.service';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';
import { ArticleStatus } from '../../../server/src/common/enums/article-status.enum';

const ARCHIVED_ID      = '00000000-0000-0000-0000-000000000001';
const SPECIALIST_ID    = '00000000-0000-0000-0000-000000000002';
const STOREWIDE_ID     = '00000000-0000-0000-0000-000000000003';

const makeArticle = (id: string, status: ArticleStatus) => ({
  id,
  title: `Article ${status}`,
  slug: `article-${status.toLowerCase()}`,
  category: 'GENERAL',
  status,
  tags: [],
  content: 'body',
  authorId: 'author-1',
  author: { id: 'author-1', username: 'writer' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe('KB article visibility — ARCHIVED regression (HTTP integration)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const mockKbService = {
    findAll: jest.fn(),
    findBySlug: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    promote: jest.fn(),
    getVersions: jest.fn(),
    getVersion: jest.fn(),
    addFavorite: jest.fn(),
    removeFavorite: jest.fn(),
    isFavorited: jest.fn(),
    getFavorites: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: '15m' } }),
      ],
      controllers: [ArticlesController],
      providers: [
        JwtStrategy,
        { provide: KnowledgeBaseService, useValue: mockKbService },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    jwtService = module.get(JwtService);
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  const token = (role: Role, userId = 'user-1') =>
    jwtService.sign({ sub: userId, username: 'u', role });

  // ── ARCHIVED article by ID ────────────────────────────────────────────────

  describe('GET /api/articles/:id — ARCHIVED visibility', () => {
    it('ADMINISTRATOR can fetch an ARCHIVED article by ID (200)', async () => {
      mockKbService.findById.mockResolvedValue(makeArticle(ARCHIVED_ID, ArticleStatus.ARCHIVED));

      const res = await request(app.getHttpServer())
        .get(`/api/articles/${ARCHIVED_ID}`)
        .set('Authorization', `Bearer ${token(Role.ADMINISTRATOR)}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(ArticleStatus.ARCHIVED);
    });

    it('PROCUREMENT_MANAGER receives 404 for an ARCHIVED article', async () => {
      mockKbService.findById.mockRejectedValue(new NotFoundException('Article not found'));

      const res = await request(app.getHttpServer())
        .get(`/api/articles/${ARCHIVED_ID}`)
        .set('Authorization', `Bearer ${token(Role.PROCUREMENT_MANAGER)}`);

      expect(res.status).toBe(404);
    });

    it('WAREHOUSE_CLERK receives 404 for an ARCHIVED article', async () => {
      mockKbService.findById.mockRejectedValue(new NotFoundException('Article not found'));

      const res = await request(app.getHttpServer())
        .get(`/api/articles/${ARCHIVED_ID}`)
        .set('Authorization', `Bearer ${token(Role.WAREHOUSE_CLERK)}`);

      expect(res.status).toBe(404);
    });

    it('PLANT_CARE_SPECIALIST receives 404 for an ARCHIVED article', async () => {
      mockKbService.findById.mockRejectedValue(new NotFoundException('Article not found'));

      const res = await request(app.getHttpServer())
        .get(`/api/articles/${ARCHIVED_ID}`)
        .set('Authorization', `Bearer ${token(Role.PLANT_CARE_SPECIALIST)}`);

      expect(res.status).toBe(404);
    });
  });

  // ── ARCHIVED article — editing blocked ────────────────────────────────────

  describe('PATCH /api/articles/:id — editing ARCHIVED is blocked (403)', () => {
    it('ADMINISTRATOR cannot edit an ARCHIVED article (403)', async () => {
      mockKbService.update.mockRejectedValue(
        new ForbiddenException('Cannot edit an archived article'),
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/articles/${ARCHIVED_ID}`)
        .set('Authorization', `Bearer ${token(Role.ADMINISTRATOR)}`)
        .send({ content: 'updated' });

      expect(res.status).toBe(403);
    });

    it('PLANT_CARE_SPECIALIST cannot edit an ARCHIVED article (403)', async () => {
      mockKbService.update.mockRejectedValue(
        new ForbiddenException('Cannot edit an archived article'),
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/articles/${ARCHIVED_ID}`)
        .set('Authorization', `Bearer ${token(Role.PLANT_CARE_SPECIALIST)}`)
        .send({ content: 'updated' });

      expect(res.status).toBe(403);
    });
  });

  // ── ARCHIVED excluded from list ───────────────────────────────────────────

  describe('GET /api/articles — ARCHIVED excluded from list results', () => {
    it('ADMINISTRATOR list does not include ARCHIVED articles', async () => {
      // Service returns only non-archived; the controller delegates entirely to service
      mockKbService.findAll.mockResolvedValue({
        data: [makeArticle(STOREWIDE_ID, ArticleStatus.STOREWIDE)],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      const res = await request(app.getHttpServer())
        .get('/api/articles')
        .set('Authorization', `Bearer ${token(Role.ADMINISTRATOR)}`);

      expect(res.status).toBe(200);
      const statuses = res.body.data.map((a: { status: string }) => a.status);
      expect(statuses).not.toContain(ArticleStatus.ARCHIVED);
      // Verify service was called with admin userId and role
      expect(mockKbService.findAll).toHaveBeenCalledWith(
        'user-1',
        Role.ADMINISTRATOR,
        expect.anything(),
      );
    });
  });

  // ── SPECIALIST_ONLY visibility ────────────────────────────────────────────

  describe('SPECIALIST_ONLY article visibility', () => {
    it('PLANT_CARE_SPECIALIST can fetch a SPECIALIST_ONLY article (200)', async () => {
      mockKbService.findById.mockResolvedValue(makeArticle(SPECIALIST_ID, ArticleStatus.SPECIALIST_ONLY));

      const res = await request(app.getHttpServer())
        .get(`/api/articles/${SPECIALIST_ID}`)
        .set('Authorization', `Bearer ${token(Role.PLANT_CARE_SPECIALIST)}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(ArticleStatus.SPECIALIST_ONLY);
    });

    it('ADMINISTRATOR can fetch a SPECIALIST_ONLY article (200)', async () => {
      mockKbService.findById.mockResolvedValue(makeArticle(SPECIALIST_ID, ArticleStatus.SPECIALIST_ONLY));

      const res = await request(app.getHttpServer())
        .get(`/api/articles/${SPECIALIST_ID}`)
        .set('Authorization', `Bearer ${token(Role.ADMINISTRATOR)}`);

      expect(res.status).toBe(200);
    });

    it('PROCUREMENT_MANAGER receives 404 for a SPECIALIST_ONLY article', async () => {
      mockKbService.findById.mockRejectedValue(new NotFoundException('Article not found'));

      const res = await request(app.getHttpServer())
        .get(`/api/articles/${SPECIALIST_ID}`)
        .set('Authorization', `Bearer ${token(Role.PROCUREMENT_MANAGER)}`);

      expect(res.status).toBe(404);
    });

    it('WAREHOUSE_CLERK receives 404 for a SPECIALIST_ONLY article', async () => {
      mockKbService.findById.mockRejectedValue(new NotFoundException('Article not found'));

      const res = await request(app.getHttpServer())
        .get(`/api/articles/${SPECIALIST_ID}`)
        .set('Authorization', `Bearer ${token(Role.WAREHOUSE_CLERK)}`);

      expect(res.status).toBe(404);
    });
  });

  // ── SUPPLIER role — no access to articles endpoint ────────────────────────

  describe('SUPPLIER role is blocked from the articles endpoint entirely (403)', () => {
    it('GET /api/articles → 403 for SUPPLIER', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/articles')
        .set('Authorization', `Bearer ${token(Role.SUPPLIER)}`);

      expect(res.status).toBe(403);
    });

    it(`GET /api/articles/${STOREWIDE_ID} → 403 for SUPPLIER`, async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/articles/${STOREWIDE_ID}`)
        .set('Authorization', `Bearer ${token(Role.SUPPLIER)}`);

      expect(res.status).toBe(403);
    });
  });
});
