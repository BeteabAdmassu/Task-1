/**
 * HTTP-level integration tests for the Returns endpoints.
 *
 * Covers:
 *   - PATCH /returns/:id/status
 *       ▸ 403 for WAREHOUSE_CLERK (role gate)
 *       ▸ 401 unauthenticated
 *       ▸ 400 on invalid UUID param
 *       ▸ 400 on invalid status enum value
 *       ▸ 404 when return does not exist
 *       ▸ 400 when trying to cancel a COMPLETED return (invalid transition)
 *       ▸ 400 when trying to change status of an already CANCELLED return
 *       ▸ 200 on valid CANCELLED transition from SUBMITTED
 *   - POST /returns
 *       ▸ 403 for WAREHOUSE_CLERK (role gate)
 *       ▸ 400 on invalid DTO
 */

const TEST_JWT_SECRET = 'integration-test-secret-long-enough-32-chars!!';
process.env.JWT_SECRET = TEST_JWT_SECRET;

import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import {
  BadRequestException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';

import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { ReturnStatus } from '../common/enums/return-status.enum';

const RA_ID = '00000000-0000-0000-0000-000000000001';

describe('ReturnsController — status transition HTTP integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const mockService = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    submit: jest.fn(),
    updateStatus: jest.fn(),
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
      controllers: [ReturnsController],
      providers: [
        JwtStrategy,
        { provide: ReturnsService, useValue: mockService },
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

  const token = (role: Role = Role.PROCUREMENT_MANAGER) =>
    jwtService.sign({ sub: 'user-1', username: 'pm', role });

  // ── Role gate ─────────────────────────────────────────────────────────────────

  describe('role gate', () => {
    it('WAREHOUSE_CLERK cannot call PATCH /returns/:id/status (returns 403)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/returns/${RA_ID}/status`)
        .set('Authorization', `Bearer ${token(Role.WAREHOUSE_CLERK)}`)
        .send({ status: ReturnStatus.CANCELLED });

      expect(res.status).toBe(403);
      expect(mockService.updateStatus).not.toHaveBeenCalled();
    });

    it('WAREHOUSE_CLERK cannot call POST /returns (returns 403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/returns')
        .set('Authorization', `Bearer ${token(Role.WAREHOUSE_CLERK)}`)
        .send({
          receiptId: RA_ID,
          lineItems: [{ receiptLineItemId: RA_ID, quantityReturned: 1, reasonCode: 'WRONG_ITEM' }],
        });

      expect(res.status).toBe(403);
    });

    it('returns 401 without a Bearer token', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/returns/${RA_ID}/status`)
        .send({ status: ReturnStatus.CANCELLED });

      expect(res.status).toBe(401);
    });
  });

  // ── DTO validation ────────────────────────────────────────────────────────────

  describe('DTO validation on PATCH /:id/status', () => {
    it('returns 400 when status is an invalid enum value', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/returns/${RA_ID}/status`)
        .set('Authorization', `Bearer ${token()}`)
        .send({ status: 'UNKNOWN_STATUS' });

      expect(res.status).toBe(400);
      expect(mockService.updateStatus).not.toHaveBeenCalled();
    });

    it('returns 400 when status field is missing', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/returns/${RA_ID}/status`)
        .set('Authorization', `Bearer ${token()}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 when id is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/returns/not-a-uuid/status')
        .set('Authorization', `Bearer ${token()}`)
        .send({ status: ReturnStatus.CANCELLED });

      expect(res.status).toBe(400);
    });
  });

  // ── Service-mapped error codes ────────────────────────────────────────────────

  describe('service error → HTTP status mapping', () => {
    it('returns 404 when the return authorization does not exist', async () => {
      mockService.updateStatus.mockRejectedValue(
        new NotFoundException('Return authorization not found'),
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/returns/${RA_ID}/status`)
        .set('Authorization', `Bearer ${token()}`)
        .send({ status: ReturnStatus.CANCELLED });

      expect(res.status).toBe(404);
    });

    it('returns 400 when trying to cancel a COMPLETED return (invalid transition)', async () => {
      mockService.updateStatus.mockRejectedValue(
        new BadRequestException('Cannot cancel a return with status COMPLETED'),
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/returns/${RA_ID}/status`)
        .set('Authorization', `Bearer ${token()}`)
        .send({ status: ReturnStatus.CANCELLED });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Cannot cancel a return with status COMPLETED');
    });

    it('returns 400 when trying to mutate a CANCELLED return (terminal state)', async () => {
      mockService.updateStatus.mockRejectedValue(
        new BadRequestException('Cannot change status of a CANCELLED return'),
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/returns/${RA_ID}/status`)
        .set('Authorization', `Bearer ${token()}`)
        .send({ status: ReturnStatus.APPROVED });

      expect(res.status).toBe(400);
    });

    it('returns 400 when trying to mutate a COMPLETED return (terminal state)', async () => {
      mockService.updateStatus.mockRejectedValue(
        new BadRequestException('Cannot change status of a COMPLETED return'),
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/returns/${RA_ID}/status`)
        .set('Authorization', `Bearer ${token()}`)
        .send({ status: ReturnStatus.SHIPPED });

      expect(res.status).toBe(400);
    });

    it('returns 200 on a valid CANCELLED transition from SUBMITTED', async () => {
      const updated = {
        id: RA_ID,
        status: ReturnStatus.CANCELLED,
        raNumber: 'RA-2024-00001',
      };
      mockService.updateStatus.mockResolvedValue(updated);

      const res = await request(app.getHttpServer())
        .patch(`/api/returns/${RA_ID}/status`)
        .set('Authorization', `Bearer ${token()}`)
        .send({ status: ReturnStatus.CANCELLED });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(ReturnStatus.CANCELLED);
      expect(mockService.updateStatus).toHaveBeenCalledWith(RA_ID, 'user-1', ReturnStatus.CANCELLED);
    });

    it('returns 200 on a valid APPROVED transition from SUBMITTED', async () => {
      const updated = { id: RA_ID, status: ReturnStatus.APPROVED };
      mockService.updateStatus.mockResolvedValue(updated);

      const res = await request(app.getHttpServer())
        .patch(`/api/returns/${RA_ID}/status`)
        .set('Authorization', `Bearer ${token(Role.ADMINISTRATOR)}`)
        .send({ status: ReturnStatus.APPROVED });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(ReturnStatus.APPROVED);
    });
  });
});
