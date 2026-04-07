/**
 * HTTP-level integration tests for the Procurement approval endpoints.
 *
 * Covers:
 *   - POST /procurement/requests/:id/approve
 *       ▸ 404 when request does not exist
 *       ▸ 400 when request is not PENDING_APPROVAL
 *       ▸ 403 when requester tries to self-approve
 *       ▸ 403 when non-supervisor PM tries to approve a tier-1 request
 *       ▸ 403 when a non-ADMINISTRATOR tries to be the sole approver on a tier-2 request
 *       ▸ 200 when a supervisor PM approves a tier-1 request
 *       ▸ 400 when the same user tries to approve twice (duplicate approval)
 *       ▸ 400 on invalid body (missing/invalid action enum)
 *       ▸ 403 on WAREHOUSE_CLERK role (role gate)
 *   - POST /procurement/requests (403 for WAREHOUSE_CLERK)
 */

const TEST_JWT_SECRET = 'integration-test-secret-long-enough-32-chars!!';
process.env.JWT_SECRET = TEST_JWT_SECRET;

import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';

import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';

const REQ_ID = '00000000-0000-0000-0000-000000000001';

describe('ProcurementController — approval HTTP integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const mockService = {
    findAll: jest.fn(),
    getApprovalQueue: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    submit: jest.fn(),
    processApproval: jest.fn(),
    cancel: jest.fn(),
    ingestLowStockAlert: jest.fn(),
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
      controllers: [ProcurementController],
      providers: [
        JwtStrategy,
        { provide: ProcurementService, useValue: mockService },
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

  const token = (role: Role, extra: Record<string, unknown> = {}) =>
    jwtService.sign({ sub: 'user-approver', username: 'approver', role, ...extra });

  // ── Role gate ─────────────────────────────────────────────────────────────────

  describe('role gate', () => {
    it('WAREHOUSE_CLERK cannot call POST /approve (returns 403)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/procurement/requests/${REQ_ID}/approve`)
        .set('Authorization', `Bearer ${token(Role.WAREHOUSE_CLERK)}`)
        .send({ action: 'APPROVE' });

      expect(res.status).toBe(403);
      expect(mockService.processApproval).not.toHaveBeenCalled();
    });

    it('WAREHOUSE_CLERK cannot call POST /requests (returns 403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/procurement/requests')
        .set('Authorization', `Bearer ${token(Role.WAREHOUSE_CLERK)}`)
        .send({ title: 'x', lineItems: [] });

      expect(res.status).toBe(403);
    });

    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/procurement/requests/${REQ_ID}/approve`)
        .send({ action: 'APPROVE' });

      expect(res.status).toBe(401);
    });
  });

  // ── Request body validation ───────────────────────────────────────────────────

  describe('DTO validation on POST /approve', () => {
    it('returns 400 when action is missing', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/procurement/requests/${REQ_ID}/approve`)
        .set('Authorization', `Bearer ${token(Role.PROCUREMENT_MANAGER, { isSupervisor: true })}`)
        .send({});

      expect(res.status).toBe(400);
      expect(mockService.processApproval).not.toHaveBeenCalled();
    });

    it('returns 400 when action is not a valid enum value', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/procurement/requests/${REQ_ID}/approve`)
        .set('Authorization', `Bearer ${token(Role.PROCUREMENT_MANAGER, { isSupervisor: true })}`)
        .send({ action: 'MAYBE' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when id is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/procurement/requests/not-a-uuid/approve')
        .set('Authorization', `Bearer ${token(Role.PROCUREMENT_MANAGER, { isSupervisor: true })}`)
        .send({ action: 'APPROVE' });

      expect(res.status).toBe(400);
    });
  });

  // ── Service-mapped error codes ────────────────────────────────────────────────

  describe('service error → HTTP status mapping', () => {
    it('returns 404 when the purchase request does not exist', async () => {
      mockService.processApproval.mockRejectedValue(
        new NotFoundException('Purchase request not found'),
      );

      const res = await request(app.getHttpServer())
        .post(`/api/procurement/requests/${REQ_ID}/approve`)
        .set('Authorization', `Bearer ${token(Role.ADMINISTRATOR)}`)
        .send({ action: 'APPROVE' });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Purchase request not found');
    });

    it('returns 400 when the request is not in PENDING_APPROVAL status', async () => {
      mockService.processApproval.mockRejectedValue(
        new BadRequestException('Request is not pending approval'),
      );

      const res = await request(app.getHttpServer())
        .post(`/api/procurement/requests/${REQ_ID}/approve`)
        .set('Authorization', `Bearer ${token(Role.ADMINISTRATOR)}`)
        .send({ action: 'APPROVE' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Request is not pending approval');
    });

    it('returns 403 when the requester tries to self-approve', async () => {
      mockService.processApproval.mockRejectedValue(
        new ForbiddenException('Cannot approve your own request'),
      );

      const res = await request(app.getHttpServer())
        .post(`/api/procurement/requests/${REQ_ID}/approve`)
        .set('Authorization', `Bearer ${token(Role.PROCUREMENT_MANAGER, { isSupervisor: true })}`)
        .send({ action: 'APPROVE' });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Cannot approve your own request');
    });

    it('returns 403 when a non-supervisor PM tries to approve a tier-1 request', async () => {
      mockService.processApproval.mockRejectedValue(
        new ForbiddenException(
          'Tier-1 requests ($500–$5,000) require a supervisor-authorized approver',
        ),
      );

      const res = await request(app.getHttpServer())
        .post(`/api/procurement/requests/${REQ_ID}/approve`)
        .set('Authorization', `Bearer ${token(Role.PROCUREMENT_MANAGER, { isSupervisor: false })}`)
        .send({ action: 'APPROVE' });

      expect(res.status).toBe(403);
    });

    it('returns 403 when a non-ADMINISTRATOR tries to be sole approver on a tier-2 request', async () => {
      mockService.processApproval.mockRejectedValue(
        new ForbiddenException(
          'Tier-2 requests require at least one ADMINISTRATOR approval',
        ),
      );

      const res = await request(app.getHttpServer())
        .post(`/api/procurement/requests/${REQ_ID}/approve`)
        .set('Authorization', `Bearer ${token(Role.PROCUREMENT_MANAGER, { isSupervisor: true })}`)
        .send({ action: 'APPROVE' });

      expect(res.status).toBe(403);
    });

    it('returns 400 when the same approver submits a duplicate approval', async () => {
      mockService.processApproval.mockRejectedValue(
        new BadRequestException('You have already approved this request'),
      );

      const res = await request(app.getHttpServer())
        .post(`/api/procurement/requests/${REQ_ID}/approve`)
        .set('Authorization', `Bearer ${token(Role.ADMINISTRATOR)}`)
        .send({ action: 'APPROVE' });

      expect(res.status).toBe(400);
    });

    it('returns 200 when a supervisor PM successfully approves a tier-1 request', async () => {
      const approved = {
        id: REQ_ID,
        status: 'APPROVED',
        approvalTier: 1,
        totalAmount: 1500,
      };
      mockService.processApproval.mockResolvedValue(approved);

      const res = await request(app.getHttpServer())
        .post(`/api/procurement/requests/${REQ_ID}/approve`)
        .set('Authorization', `Bearer ${token(Role.PROCUREMENT_MANAGER, { isSupervisor: true })}`)
        .send({ action: 'APPROVE', comments: 'Looks good' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('APPROVED');
      // Confirm the controller passes isSupervisor from the JWT payload
      expect(mockService.processApproval).toHaveBeenCalledWith(
        REQ_ID,
        expect.objectContaining({ action: 'APPROVE', comments: 'Looks good' }),
        'user-approver',
        Role.PROCUREMENT_MANAGER,
        true,
      );
    });

    it('returns 200 on rejection with optional comments', async () => {
      const rejected = { id: REQ_ID, status: 'REJECTED' };
      mockService.processApproval.mockResolvedValue(rejected);

      const res = await request(app.getHttpServer())
        .post(`/api/procurement/requests/${REQ_ID}/approve`)
        .set('Authorization', `Bearer ${token(Role.ADMINISTRATOR)}`)
        .send({ action: 'REJECT', comments: 'Budget exceeded' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('REJECTED');
    });
  });
});
