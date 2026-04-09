/**
 * Integration tests for authentication + authorization HTTP layer.
 *
 * Strategy: build a minimal NestJS application with real guards
 * (JwtAuthGuard, RolesGuard), real Passport strategies (JWT + Local),
 * and a mocked service/repository layer so no live database is required.
 *
 * Tests cover:
 *   - Login happy path
 *   - Refresh happy path
 *   - 401 for unauthenticated access
 *   - 403 for authenticated but wrong-role access
 *   - Supplier object-level isolation (supplier A cannot read supplier B's resource)
 */

// Must be set BEFORE any module initialises JwtStrategy (reads env in constructor)
const TEST_JWT_SECRET = 'integration-test-secret-long-enough-32-chars!!';
process.env.JWT_SECRET = TEST_JWT_SECRET;

import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import {
  Controller,
  Get,
  INestApplication,
  NotFoundException,
  Param,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import { InjectRepository } from '@nestjs/typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';

import { AuthController } from '../../../server/src/auth/auth.controller';
import { AuthService } from '../../../server/src/auth/auth.service';
import { Session } from '../../../server/src/auth/session.entity';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { LocalStrategy } from '../../../server/src/auth/strategies/local.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Roles } from '../../../server/src/common/decorators/roles.decorator';
import { Role } from '../../../server/src/common/enums/role.enum';
import { User } from '../../../server/src/users/user.entity';
import { UsersService } from '../../../server/src/users/users.service';
import { SupplierPortalPoController } from '../../../server/src/purchase-orders/supplier-portal-po.controller';
import { PurchaseOrdersService } from '../../../server/src/purchase-orders/purchase-orders.service';
import { SupplierPortalReturnsController } from '../../../server/src/returns/supplier-portal-returns.controller';
import { ReturnsService } from '../../../server/src/returns/returns.service';

// ── Test controllers ──────────────────────────────────────────────────────────

/** Exercises role-gated endpoints for 401/403/200 assertions. */
@Controller('test-roles')
class TestRoleController {
  @Get('procurement')
  @Roles(Role.PROCUREMENT_MANAGER)
  procurement() {
    return { access: 'granted', role: 'PROCUREMENT_MANAGER' };
  }

  @Get('supplier')
  @Roles(Role.SUPPLIER)
  supplierOnly() {
    return { access: 'granted', role: 'SUPPLIER' };
  }

  @Get('any-auth')
  anyAuthenticated() {
    return { access: 'granted' };
  }
}

/**
 * Mimics the supplier portal's object-level isolation pattern:
 * looks up the authenticated user's linked supplierId from the DB and
 * returns 404 when the requested resource belongs to a different supplier.
 */
@Controller('test-isolation')
class SupplierIsolationController {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  @Get(':supplierId')
  @Roles(Role.SUPPLIER)
  async getForSupplier(
    @Param('supplierId') supplierId: string,
    @Req() req: Request,
  ) {
    const userId = (req.user as { id: string }).id;
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user?.supplierId || user.supplierId !== supplierId) {
      throw new NotFoundException('Resource not found');
    }
    return { supplierId };
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Auth + Authorization — HTTP integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const mockAuthService = {
    validateUser: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    changePassword: jest.fn(),
  };

  const mockSessionRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
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
      controllers: [AuthController, TestRoleController, SupplierIsolationController],
      providers: [
        JwtStrategy,
        LocalStrategy,
        { provide: AuthService, useValue: mockAuthService },
        { provide: UsersService, useValue: { findByUsername: jest.fn() } },
        { provide: getRepositoryToken(Session), useValue: mockSessionRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
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

  // ── Login happy path ────────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    it('returns 200 with accessToken and user on valid credentials', async () => {
      const testUser = {
        id: 'u-pm',
        username: 'alice',
        role: Role.PROCUREMENT_MANAGER,
        isActive: true,
        mustChangePassword: false,
        passwordHash: 'hash',
      } as User;

      mockAuthService.validateUser.mockResolvedValue(testUser);
      mockAuthService.login.mockResolvedValue({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        user: {
          id: testUser.id,
          username: testUser.username,
          role: testUser.role,
          mustChangePassword: false,
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'alice', password: 'password1' });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.username).toBe('alice');
      expect(res.body.user.role).toBe(Role.PROCUREMENT_MANAGER);
      // Sensitive fields must not leak
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('returns 401 on invalid credentials', async () => {
      // Returning null/false signals "bad credentials" to Passport's local strategy
      // without an unhandled exception (which would produce 500).
      mockAuthService.validateUser.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'alice', password: 'wrongpass' });

      expect(res.status).toBe(401);
    });

    it('rate-limits login to 10 per 15 min — returns 429 on the 11th attempt', async () => {
      // Build an isolated app that includes ThrottlerGuard so the route-level
      // @Throttle({ default: { ttl: 900_000, limit: 10 } }) is active.
      // A fresh instance guarantees the throttle counter starts at 0.
      const throttleModule = await Test.createTestingModule({
        imports: [
          PassportModule,
          JwtModule.register({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: '15m' } }),
          ThrottlerModule.forRoot([{ ttl: 900_000, limit: 200 }]),
        ],
        controllers: [AuthController],
        providers: [
          JwtStrategy,
          LocalStrategy,
          {
            provide: AuthService,
            useValue: { ...mockAuthService, validateUser: jest.fn().mockResolvedValue(null) },
          },
          { provide: UsersService, useValue: { findByUsername: jest.fn() } },
          { provide: getRepositoryToken(Session), useValue: mockSessionRepo },
          { provide: getRepositoryToken(User), useValue: mockUserRepo },
          { provide: APP_GUARD, useClass: JwtAuthGuard },
          { provide: APP_GUARD, useClass: RolesGuard },
          { provide: APP_GUARD, useClass: ThrottlerGuard },
        ],
      }).compile();

      const throttleApp = throttleModule.createNestApplication();
      throttleApp.setGlobalPrefix('api');
      throttleApp.use(cookieParser());
      throttleApp.useGlobalPipes(
        new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
      );
      await throttleApp.init();

      try {
        const statuses: number[] = [];
        for (let i = 0; i < 11; i++) {
          const res = await request(throttleApp.getHttpServer())
            .post('/api/auth/login')
            .send({ username: 'alice', password: 'password1' });
          statuses.push(res.status);
        }

        // First 10 attempts → 401 (bad credentials, within rate limit)
        for (let i = 0; i < 10; i++) {
          expect(statuses[i]).toBe(401);
        }
        // 11th attempt → 429 Too Many Requests
        expect(statuses[10]).toBe(429);
      } finally {
        await throttleApp.close();
      }
    });
  });

  // ── Refresh happy path ──────────────────────────────────────────────────────

  describe('POST /api/auth/refresh', () => {
    it('returns 200 with new accessToken when refresh cookie is valid', async () => {
      mockAuthService.refresh.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-rotated-refresh-token',
        user: {
          id: 'u-pm',
          username: 'alice',
          role: Role.PROCUREMENT_MANAGER,
          mustChangePassword: false,
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', 'refresh_token=valid-refresh-token');

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBe('new-access-token');
      // Rotated refresh token must be in the HttpOnly cookie only — never in the response body
      expect(res.body.refreshToken).toBeUndefined();
    });

    it('returns 401 when no refresh cookie is present', async () => {
      const res = await request(app.getHttpServer()).post('/api/auth/refresh');
      expect(res.status).toBe(401);
    });

    it('replay attack: old refresh token is rejected after rotation (service throws 401)', async () => {
      // Simulate the token-rotation scenario:
      //   1st call  — succeeds; service now stores a NEW token in the session row.
      //   2nd call  — same old cookie value is replayed; service cannot find a session
      //               matching the stale token and throws UnauthorizedException.
      //
      // The HTTP layer must propagate that as a 401.
      const { UnauthorizedException } = await import('@nestjs/common');

      // First refresh — succeeds
      mockAuthService.refresh.mockResolvedValueOnce({
        accessToken: 'rotated-access-token',
        refreshToken: 'rotated-refresh-token',
        user: { id: 'u-pm', username: 'alice', role: Role.PROCUREMENT_MANAGER, mustChangePassword: false },
      });

      const firstRes = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', 'refresh_token=original-token');
      expect(firstRes.status).toBe(200);

      // Second call with the SAME stale token — service rejects it
      mockAuthService.refresh.mockRejectedValueOnce(
        new UnauthorizedException('Invalid or expired refresh token'),
      );

      const replayRes = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', 'refresh_token=original-token');

      expect(replayRes.status).toBe(401);
    });
  });

  // ── 401 — no token ──────────────────────────────────────────────────────────

  describe('401 — unauthenticated requests', () => {
    it('returns 401 accessing any protected route without a Bearer token', async () => {
      const res = await request(app.getHttpServer()).get('/api/test-roles/any-auth');
      expect(res.status).toBe(401);
    });

    it('returns 401 accessing a role-gated route without a token', async () => {
      const res = await request(app.getHttpServer()).get('/api/test-roles/procurement');
      expect(res.status).toBe(401);
    });

    it('returns 401 for an expired/invalid Bearer token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/test-roles/any-auth')
        .set('Authorization', 'Bearer not.a.valid.jwt');
      expect(res.status).toBe(401);
    });
  });

  // ── 403 — wrong role ────────────────────────────────────────────────────────

  describe('403 — authenticated but wrong role', () => {
    it('SUPPLIER cannot access PROCUREMENT_MANAGER-only endpoint', async () => {
      const token = jwtService.sign({ sub: 'u-sup', username: 'sup', role: Role.SUPPLIER });
      const res = await request(app.getHttpServer())
        .get('/api/test-roles/procurement')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('PROCUREMENT_MANAGER cannot access SUPPLIER-only endpoint', async () => {
      const token = jwtService.sign({ sub: 'u-pm', username: 'pm', role: Role.PROCUREMENT_MANAGER });
      const res = await request(app.getHttpServer())
        .get('/api/test-roles/supplier')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('ADMINISTRATOR cannot access SUPPLIER-only endpoint', async () => {
      const token = jwtService.sign({ sub: 'u-adm', username: 'admin', role: Role.ADMINISTRATOR });
      const res = await request(app.getHttpServer())
        .get('/api/test-roles/supplier')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('WAREHOUSE_CLERK cannot access SUPPLIER-only endpoint', async () => {
      const token = jwtService.sign({ sub: 'u-wc', username: 'clerk', role: Role.WAREHOUSE_CLERK });
      const res = await request(app.getHttpServer())
        .get('/api/test-roles/supplier')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  });

  // ── 200 — correct role ──────────────────────────────────────────────────────

  describe('200 — correct role grants access', () => {
    it('PROCUREMENT_MANAGER can access procurement endpoint', async () => {
      const token = jwtService.sign({ sub: 'u-pm', username: 'pm', role: Role.PROCUREMENT_MANAGER });
      const res = await request(app.getHttpServer())
        .get('/api/test-roles/procurement')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    it('SUPPLIER can access supplier endpoint', async () => {
      const token = jwtService.sign({ sub: 'u-sup', username: 'sup', role: Role.SUPPLIER });
      const res = await request(app.getHttpServer())
        .get('/api/test-roles/supplier')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  // ── Supplier object-level isolation ────────────────────────────────────────

  describe('Supplier object-level isolation', () => {
    it('supplier A cannot access supplier B\'s resource (returns 404)', async () => {
      // user-a is linked to supplier-A
      mockUserRepo.findOne.mockResolvedValue({
        id: 'user-a',
        supplierId: 'supplier-A',
        role: Role.SUPPLIER,
      });

      const tokenA = jwtService.sign({ sub: 'user-a', username: 'sup-a', role: Role.SUPPLIER });

      // Request supplier-B's resource — user-a has no access
      const res = await request(app.getHttpServer())
        .get('/api/test-isolation/supplier-B')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
    });

    it('supplier A can access their own resource (returns 200)', async () => {
      // user-a is linked to supplier-A
      mockUserRepo.findOne.mockResolvedValue({
        id: 'user-a',
        supplierId: 'supplier-A',
        role: Role.SUPPLIER,
      });

      const tokenA = jwtService.sign({ sub: 'user-a', username: 'sup-a', role: Role.SUPPLIER });

      // Request supplier-A's resource — their own data
      const res = await request(app.getHttpServer())
        .get('/api/test-isolation/supplier-A')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.supplierId).toBe('supplier-A');
    });

    it('user with no linked supplier gets 404 (not 403)', async () => {
      // user-b has no supplierId
      mockUserRepo.findOne.mockResolvedValue({
        id: 'user-b',
        supplierId: null,
        role: Role.SUPPLIER,
      });

      const tokenB = jwtService.sign({ sub: 'user-b', username: 'sup-b', role: Role.SUPPLIER });

      const res = await request(app.getHttpServer())
        .get('/api/test-isolation/supplier-A')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
    });
  });

  // ── Supplier portal PO object-level isolation (real controller) ─────────────

  describe('Supplier portal PO — real controller object-level isolation', () => {
    let poApp: INestApplication;
    let poJwtService: JwtService;

    const mockPoService = {
      findForSupplier: jest.fn(),
      findByIdForSupplier: jest.fn(),
    };

    const mockPoUserRepo = {
      findOne: jest.fn(),
    };

    beforeAll(async () => {
      const poModule = await Test.createTestingModule({
        imports: [
          PassportModule,
          JwtModule.register({
            secret: TEST_JWT_SECRET,
            signOptions: { expiresIn: '15m' },
          }),
        ],
        controllers: [SupplierPortalPoController],
        providers: [
          JwtStrategy,
          { provide: PurchaseOrdersService, useValue: mockPoService },
          { provide: getRepositoryToken(User), useValue: mockPoUserRepo },
          { provide: APP_GUARD, useClass: JwtAuthGuard },
          { provide: APP_GUARD, useClass: RolesGuard },
        ],
      }).compile();

      poApp = poModule.createNestApplication();
      poApp.setGlobalPrefix('api');
      poApp.use(cookieParser());
      await poApp.init();

      poJwtService = poModule.get(JwtService);
    });

    afterAll(() => poApp.close());

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('supplier A cannot access supplier B\'s PO (returns 404)', async () => {
      // user-a is linked to supplier-A
      mockPoUserRepo.findOne.mockResolvedValue({
        id: 'user-a',
        supplierId: 'supplier-A',
        role: Role.SUPPLIER,
      });

      // Service throws 404 because the PO belongs to supplier-B, not supplier-A
      mockPoService.findByIdForSupplier.mockRejectedValue(
        new NotFoundException('Purchase order not found'),
      );

      const tokenA = poJwtService.sign({ sub: 'user-a', username: 'sup-a', role: Role.SUPPLIER });

      const res = await request(poApp.getHttpServer())
        .get('/api/supplier-portal/purchase-orders/po-belongs-to-B')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      // Confirm the service was called with supplier-A's id, not supplier-B's
      expect(mockPoService.findByIdForSupplier).toHaveBeenCalledWith(
        'po-belongs-to-B',
        'supplier-A',
      );
    });

    it('supplier A can access their own PO (returns 200)', async () => {
      mockPoUserRepo.findOne.mockResolvedValue({
        id: 'user-a',
        supplierId: 'supplier-A',
        role: Role.SUPPLIER,
      });

      mockPoService.findByIdForSupplier.mockResolvedValue({
        id: 'po-belongs-to-A',
        supplierId: 'supplier-A',
        status: 'PENDING',
      });

      const tokenA = poJwtService.sign({ sub: 'user-a', username: 'sup-a', role: Role.SUPPLIER });

      const res = await request(poApp.getHttpServer())
        .get('/api/supplier-portal/purchase-orders/po-belongs-to-A')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.supplierId).toBe('supplier-A');
    });

    it('non-SUPPLIER role (PROCUREMENT_MANAGER) cannot access supplier portal PO endpoint (403)', async () => {
      const tokenPm = poJwtService.sign({
        sub: 'u-pm',
        username: 'pm',
        role: Role.PROCUREMENT_MANAGER,
      });

      const res = await request(poApp.getHttpServer())
        .get('/api/supplier-portal/purchase-orders/any-po-id')
        .set('Authorization', `Bearer ${tokenPm}`);

      expect(res.status).toBe(403);
    });

    it('user with no linked supplier gets 404 when accessing any PO', async () => {
      mockPoUserRepo.findOne.mockResolvedValue({
        id: 'user-c',
        supplierId: null,
        role: Role.SUPPLIER,
      });

      const tokenC = poJwtService.sign({ sub: 'user-c', username: 'sup-c', role: Role.SUPPLIER });

      const res = await request(poApp.getHttpServer())
        .get('/api/supplier-portal/purchase-orders/some-po-id')
        .set('Authorization', `Bearer ${tokenC}`);

      expect(res.status).toBe(404);
    });
  });

  // ── Supplier portal Returns — real controller object-level isolation ────────

  describe('Supplier portal Returns — real controller object-level isolation', () => {
    let returnsApp: INestApplication;
    let returnsJwtService: JwtService;

    const mockReturnsService = {
      findForSupplier: jest.fn(),
      findByIdForSupplier: jest.fn(),
    };

    const mockReturnsUserRepo = {
      findOne: jest.fn(),
    };

    beforeAll(async () => {
      const returnsModule = await Test.createTestingModule({
        imports: [
          PassportModule,
          JwtModule.register({
            secret: TEST_JWT_SECRET,
            signOptions: { expiresIn: '15m' },
          }),
        ],
        controllers: [SupplierPortalReturnsController],
        providers: [
          JwtStrategy,
          { provide: ReturnsService, useValue: mockReturnsService },
          { provide: getRepositoryToken(User), useValue: mockReturnsUserRepo },
          { provide: APP_GUARD, useClass: JwtAuthGuard },
          { provide: APP_GUARD, useClass: RolesGuard },
        ],
      }).compile();

      returnsApp = returnsModule.createNestApplication();
      returnsApp.setGlobalPrefix('api');
      returnsApp.use(cookieParser());
      await returnsApp.init();

      returnsJwtService = returnsModule.get(JwtService);
    });

    afterAll(() => returnsApp.close());

    beforeEach(() => jest.clearAllMocks());

    it('supplier A cannot access supplier B return by ID (returns 404)', async () => {
      mockReturnsUserRepo.findOne.mockResolvedValue({
        id: 'user-a',
        supplierId: 'supplier-A',
        role: Role.SUPPLIER,
      });

      mockReturnsService.findByIdForSupplier.mockRejectedValue(
        new NotFoundException('Return authorization not found'),
      );

      const tokenA = returnsJwtService.sign({
        sub: 'user-a',
        username: 'sup-a',
        role: Role.SUPPLIER,
      });

      const res = await request(returnsApp.getHttpServer())
        .get('/api/supplier-portal/returns/ra-belongs-to-B')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      expect(mockReturnsService.findByIdForSupplier).toHaveBeenCalledWith(
        'ra-belongs-to-B',
        'supplier-A',
      );
    });

    it('supplier A can access own return record (returns 200)', async () => {
      mockReturnsUserRepo.findOne.mockResolvedValue({
        id: 'user-a',
        supplierId: 'supplier-A',
        role: Role.SUPPLIER,
      });

      mockReturnsService.findByIdForSupplier.mockResolvedValue({
        id: 'ra-belongs-to-A',
        supplierId: 'supplier-A',
        status: 'SUBMITTED',
      });

      const tokenA = returnsJwtService.sign({
        sub: 'user-a',
        username: 'sup-a',
        role: Role.SUPPLIER,
      });

      const res = await request(returnsApp.getHttpServer())
        .get('/api/supplier-portal/returns/ra-belongs-to-A')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.supplierId).toBe('supplier-A');
    });

    it('user with no linked supplier profile gets 404', async () => {
      mockReturnsUserRepo.findOne.mockResolvedValue({
        id: 'user-c',
        supplierId: null,
        role: Role.SUPPLIER,
      });

      const tokenC = returnsJwtService.sign({
        sub: 'user-c',
        username: 'sup-c',
        role: Role.SUPPLIER,
      });

      const res = await request(returnsApp.getHttpServer())
        .get('/api/supplier-portal/returns/any-ra-id')
        .set('Authorization', `Bearer ${tokenC}`);

      expect(res.status).toBe(404);
    });

    it('non-SUPPLIER role (PROCUREMENT_MANAGER) gets 403', async () => {
      const tokenPm = returnsJwtService.sign({
        sub: 'u-pm',
        username: 'pm',
        role: Role.PROCUREMENT_MANAGER,
      });

      const res = await request(returnsApp.getHttpServer())
        .get('/api/supplier-portal/returns/any-ra-id')
        .set('Authorization', `Bearer ${tokenPm}`);

      expect(res.status).toBe(403);
    });

    it('supplier A list endpoint scopes to their own returns only', async () => {
      mockReturnsUserRepo.findOne.mockResolvedValue({
        id: 'user-a',
        supplierId: 'supplier-A',
        role: Role.SUPPLIER,
      });

      mockReturnsService.findForSupplier.mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      const tokenA = returnsJwtService.sign({
        sub: 'user-a',
        username: 'sup-a',
        role: Role.SUPPLIER,
      });

      const res = await request(returnsApp.getHttpServer())
        .get('/api/supplier-portal/returns')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(mockReturnsService.findForSupplier).toHaveBeenCalledWith(
        'supplier-A',
        expect.anything(),
      );
    });
  });
});
