/**
 * Integration tests for Search HTTP layer.
 *
 * Strategy: build a minimal NestJS application with real guards
 * (JwtAuthGuard, RolesGuard), real Passport strategies (JWT),
 * and a mocked service layer so no live database is required.
 *
 * Tests cover:
 *   - GET /api/articles/search executes successfully against current schema
 *   - Role-based access: SUPPLIER cannot access search
 *   - Specialist sees results (search delegates visibility to service)
 *   - Direct URL access denied for unauthenticated users
 */

const TEST_JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret-long-enough-32-chars!!';
process.env.JWT_SECRET = TEST_JWT_SECRET;

import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { SearchController } from '../../../server/src/search/search.controller';
import { SearchService } from '../../../server/src/search/search.service';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';
import { User } from '../../../server/src/users/user.entity';
import { SearchSynonym } from '../../../server/src/search/entities/search-synonym.entity';
import { SearchHistory } from '../../../server/src/search/entities/search-history.entity';
import { Article } from '../../../server/src/knowledge-base/entities/article.entity';

describe('Search — HTTP integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const mockSearchService = {
    search: jest.fn(),
    findSimilar: jest.fn(),
    getHistory: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [SearchController],
      providers: [
        JwtStrategy,
        { provide: SearchService, useValue: mockSearchService },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(SearchSynonym), useValue: {} },
        { provide: getRepositoryToken(SearchHistory), useValue: {} },
        { provide: getRepositoryToken(Article), useValue: {} },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.init();

    jwtService = module.get(JwtService);
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  // ── Successful execution ────────────────────────────────────────────────

  it('GET /api/articles/search returns 200 with search results for ADMINISTRATOR', async () => {
    mockSearchService.search.mockResolvedValue({
      data: [
        {
          id: 'a1',
          title: 'Potting Mix Guide',
          slug: 'potting-mix-guide',
          category: 'CARE_GUIDE',
          status: 'STOREWIDE',
          tags: ['soil'],
          author: { id: 'u1', username: 'admin' },
          headline: 'How to use <mark>potting</mark> mix',
          rank: 0.8,
          updatedAt: new Date(),
        },
      ],
      total: 1,
      expandedTerms: ['potting'],
    });

    const token = jwtService.sign({ sub: 'u-admin', username: 'admin', role: Role.ADMINISTRATOR });

    const res = await request(app.getHttpServer())
      .get('/api/articles/search?q=potting')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].author.username).toBe('admin');
    // Confirm no firstName/lastName in response — only username
    expect(res.body.data[0].author.firstName).toBeUndefined();
    expect(res.body.data[0].author.lastName).toBeUndefined();
    expect(mockSearchService.search).toHaveBeenCalledWith(
      'u-admin', Role.ADMINISTRATOR, 'potting', undefined, undefined,
    );
  });

  // ── Specialist access ──────────────────────────────────────────────────

  it('GET /api/articles/search returns 200 for PLANT_CARE_SPECIALIST', async () => {
    mockSearchService.search.mockResolvedValue({ data: [], total: 0, expandedTerms: [] });

    const token = jwtService.sign({
      sub: 'u-spec',
      username: 'specialist',
      role: Role.PLANT_CARE_SPECIALIST,
    });

    const res = await request(app.getHttpServer())
      .get('/api/articles/search?q=tropical')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mockSearchService.search).toHaveBeenCalledWith(
      'u-spec', Role.PLANT_CARE_SPECIALIST, 'tropical', undefined, undefined,
    );
  });

  // ── SUPPLIER role denied ───────────────────────────────────────────────

  it('GET /api/articles/search returns 403 for SUPPLIER role', async () => {
    const token = jwtService.sign({ sub: 'u-sup', username: 'sup', role: Role.SUPPLIER });

    const res = await request(app.getHttpServer())
      .get('/api/articles/search?q=anything')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  // ── Unauthenticated direct URL access ──────────────────────────────────

  it('GET /api/articles/search returns 401 without a token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/articles/search?q=anything');

    expect(res.status).toBe(401);
  });
});
