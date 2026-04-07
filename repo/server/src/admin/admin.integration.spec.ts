/**
 * Authorization matrix for all high-risk admin endpoints.
 *
 * Every non-ADMINISTRATOR role must receive 403 on every admin endpoint.
 * ADMINISTRATOR must receive 200/201/204 (mocked service returns success).
 *
 * Covered controllers:
 *   AdminController       — /admin/users, /admin/users/:id, /admin/users/:id/reset-password
 *   ObservabilityController — /admin/logs, /admin/jobs, /admin/jobs/:id/retry, /admin/system/stats
 *   DataQualityController — /admin/duplicates, /admin/duplicates/:id/merge|dismiss,
 *                            /admin/data-quality/issues|run-check|summary
 */

const TEST_JWT_SECRET = 'integration-test-secret-long-enough-32-chars!!';
process.env.JWT_SECRET = TEST_JWT_SECRET;

import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ObservabilityController } from '../observability/observability.controller';
import { ObservabilityService } from '../observability/observability.service';
import { SchedulerService } from '../observability/scheduler.service';
import { DataQualityController } from '../data-quality/data-quality.controller';
import { DataQualityService } from '../data-quality/data-quality.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';

const UUID = '00000000-0000-0000-0000-000000000001';

// ── Minimal stub factories ──────────────────────────────────────────────────

const mockAdminService = {
  findAll: jest.fn().mockResolvedValue({ data: [], meta: {} }),
  createUser: jest.fn().mockResolvedValue({ id: UUID }),
  updateUser: jest.fn().mockResolvedValue({ id: UUID }),
  resetPassword: jest.fn().mockResolvedValue({ password: 'tmp' }),
};

const mockObservabilityService = {
  queryLogs: jest.fn().mockResolvedValue({ data: [] }),
  getJobMetrics: jest.fn().mockResolvedValue([]),
  getJobRun: jest.fn().mockResolvedValue({ id: UUID, jobName: 'quality-check' }),
  getQueueStats: jest.fn().mockResolvedValue([]),
  getSystemStats: jest.fn().mockResolvedValue({}),
};

const mockSchedulerService = {
  triggerJob: jest.fn().mockResolvedValue(undefined),
};

const mockDataQualityService = {
  getDuplicates: jest.fn().mockResolvedValue([]),
  getDuplicateWithDetails: jest.fn().mockResolvedValue({}),
  mergeDuplicate: jest.fn().mockResolvedValue(undefined),
  dismissDuplicate: jest.fn().mockResolvedValue(undefined),
  getLastQualityReport: jest.fn().mockResolvedValue(null),
  runQualityChecks: jest.fn().mockResolvedValue({}),
  getPendingCount: jest.fn().mockResolvedValue(0),
};

// ── Test suite ──────────────────────────────────────────────────────────────

describe('Admin endpoints — authorization matrix', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: '15m' } }),
      ],
      controllers: [AdminController, ObservabilityController, DataQualityController],
      providers: [
        JwtStrategy,
        { provide: AdminService, useValue: mockAdminService },
        { provide: ObservabilityService, useValue: mockObservabilityService },
        { provide: SchedulerService, useValue: mockSchedulerService },
        { provide: DataQualityService, useValue: mockDataQualityService },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }),
    );
    await app.init();
    jwtService = module.get(JwtService);
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  const token = (role: Role) =>
    jwtService.sign({ sub: 'u1', username: 'test', role });

  const adminToken = () => token(Role.ADMINISTRATOR);

  const nonAdminRoles: Role[] = [
    Role.PROCUREMENT_MANAGER,
    Role.WAREHOUSE_CLERK,
    Role.PLANT_CARE_SPECIALIST,
    Role.SUPPLIER,
  ];

  // ── Endpoint definitions ──────────────────────────────────────────────────

  type Endpoint = { method: 'get' | 'post' | 'patch'; path: string };

  const adminEndpoints: Endpoint[] = [
    // User management
    { method: 'get',   path: '/api/admin/users' },
    { method: 'post',  path: '/api/admin/users' },
    { method: 'patch', path: `/api/admin/users/${UUID}` },
    { method: 'post',  path: `/api/admin/users/${UUID}/reset-password` },
    // Observability
    { method: 'get',   path: '/api/admin/logs' },
    { method: 'get',   path: '/api/admin/jobs' },
    { method: 'post',  path: `/api/admin/jobs/${UUID}/retry` },
    { method: 'get',   path: '/api/admin/system/stats' },
    // Data quality
    { method: 'get',   path: '/api/admin/duplicates' },
    { method: 'get',   path: `/api/admin/duplicates/${UUID}` },
    { method: 'post',  path: `/api/admin/duplicates/${UUID}/merge` },
    { method: 'post',  path: `/api/admin/duplicates/${UUID}/dismiss` },
    { method: 'get',   path: '/api/admin/data-quality/issues' },
    { method: 'post',  path: '/api/admin/data-quality/run-check' },
    { method: 'get',   path: '/api/admin/data-quality/summary' },
  ];

  // ── Non-admin roles: all endpoints must return 403 ────────────────────────

  describe('non-ADMINISTRATOR roles receive 403 on every admin endpoint', () => {
    for (const role of nonAdminRoles) {
      describe(`role: ${role}`, () => {
        for (const ep of adminEndpoints) {
          it(`${ep.method.toUpperCase()} ${ep.path} → 403`, async () => {
            const res = await (request(app.getHttpServer()) as unknown as Record<string, (path: string) => request.Test>)
              [ep.method](ep.path)
              .set('Authorization', `Bearer ${token(role)}`);

            expect(res.status).toBe(403);
          });
        }
      });
    }
  });

  // ── No token: all endpoints must return 401 ───────────────────────────────

  describe('unauthenticated requests receive 401 on every admin endpoint', () => {
    for (const ep of adminEndpoints) {
      it(`${ep.method.toUpperCase()} ${ep.path} → 401`, async () => {
        const res = await (request(app.getHttpServer()) as unknown as Record<string, (path: string) => request.Test>)
          [ep.method](ep.path);

        expect(res.status).toBe(401);
      });
    }
  });

  // ── ADMINISTRATOR: spot-check key endpoints return success ────────────────

  describe('ADMINISTRATOR role receives success on admin endpoints', () => {
    it('GET /admin/users → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken()}`);
      expect(res.status).toBe(200);
    });

    it('GET /admin/logs → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/logs')
        .set('Authorization', `Bearer ${adminToken()}`);
      expect(res.status).toBe(200);
    });

    it('GET /admin/jobs → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/jobs')
        .set('Authorization', `Bearer ${adminToken()}`);
      expect(res.status).toBe(200);
    });

    it('GET /admin/data-quality/summary → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/data-quality/summary')
        .set('Authorization', `Bearer ${adminToken()}`);
      expect(res.status).toBe(200);
    });

    it('POST /admin/data-quality/run-check → 200', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/data-quality/run-check')
        .set('Authorization', `Bearer ${adminToken()}`);
      expect(res.status).toBe(200);
    });
  });
});
