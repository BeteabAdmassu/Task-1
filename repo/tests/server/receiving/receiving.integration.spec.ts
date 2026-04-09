/**
 * HTTP-level integration tests for the Receipts controller.
 *
 * Covers:
 *   POST /receipts
 *     ▸ 403 for PROCUREMENT_MANAGER (write is WH | ADM only)
 *     ▸ 403 for PLANT_CARE_SPECIALIST
 *     ▸ 403 for SUPPLIER
 *     ▸ 401 unauthenticated
 *     ▸ 400 on missing poId (required UUID field)
 *     ▸ 400 on missing lineItems array
 *     ▸ 400 on invalid poLineItemId in line item (not a UUID)
 *     ▸ 400 on negative quantityReceived
 *     ▸ 400 on invalid varianceReasonCode enum value
 *     ▸ 201 on valid body (WAREHOUSE_CLERK)
 *
 *   PATCH /receipts/:id/complete
 *     ▸ 403 for PROCUREMENT_MANAGER
 *     ▸ 400 on invalid UUID id param
 *     ▸ 200 on valid call (WAREHOUSE_CLERK)
 *
 *   GET /receipts
 *     ▸ 200 for WAREHOUSE_CLERK, PROCUREMENT_MANAGER, ADMINISTRATOR
 *     ▸ 403 for PLANT_CARE_SPECIALIST and SUPPLIER
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

import { ReceiptsController } from '../../../server/src/receiving/receipts.controller';
import { ReceivingService } from '../../../server/src/receiving/receiving.service';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';

const PO_UUID  = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const LI_UUID  = 'a3bb189e-8bf9-4f2c-b7f4-1e0e2e9b9ca3';
const REC_UUID = 'c73bcdcc-2669-4bf6-81d3-e4ae73fb11fd';

const validBody = {
  poId: PO_UUID,
  lineItems: [{ poLineItemId: LI_UUID, quantityReceived: 5 }],
};

describe('ReceiptsController — HTTP integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const mockService = {
    findAll: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    create: jest.fn().mockResolvedValue({ id: REC_UUID, status: 'IN_PROGRESS' }),
    complete: jest.fn().mockResolvedValue({ id: REC_UUID, status: 'COMPLETED' }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: '15m' } }),
      ],
      controllers: [ReceiptsController],
      providers: [
        JwtStrategy,
        { provide: ReceivingService, useValue: mockService },
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

  const token = (role: Role) =>
    jwtService.sign({ sub: 'u1', username: 'user', role });

  // ── POST /receipts — role gate ─────────────────────────────────────────────

  describe('POST /api/receipts — role gate', () => {
    it('WAREHOUSE_CLERK can create a receipt (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/receipts')
        .set('Authorization', `Bearer ${token(Role.WAREHOUSE_CLERK)}`)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(mockService.create).toHaveBeenCalledWith('u1', expect.objectContaining({ poId: PO_UUID }));
    });

    it('ADMINISTRATOR can create a receipt (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/receipts')
        .set('Authorization', `Bearer ${token(Role.ADMINISTRATOR)}`)
        .send(validBody);

      expect(res.status).toBe(201);
    });

    it('PROCUREMENT_MANAGER cannot create a receipt (403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/receipts')
        .set('Authorization', `Bearer ${token(Role.PROCUREMENT_MANAGER)}`)
        .send(validBody);

      expect(res.status).toBe(403);
      expect(mockService.create).not.toHaveBeenCalled();
    });

    it('PLANT_CARE_SPECIALIST cannot create a receipt (403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/receipts')
        .set('Authorization', `Bearer ${token(Role.PLANT_CARE_SPECIALIST)}`)
        .send(validBody);

      expect(res.status).toBe(403);
    });

    it('SUPPLIER cannot create a receipt (403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/receipts')
        .set('Authorization', `Bearer ${token(Role.SUPPLIER)}`)
        .send(validBody);

      expect(res.status).toBe(403);
    });

    it('unauthenticated request is rejected (401)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/receipts')
        .send(validBody);

      expect(res.status).toBe(401);
    });
  });

  // ── POST /receipts — DTO validation ───────────────────────────────────────

  describe('POST /api/receipts — DTO validation', () => {
    const wh = () => token(Role.WAREHOUSE_CLERK);

    it('returns 400 when poId is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/receipts')
        .set('Authorization', `Bearer ${wh()}`)
        .send({ lineItems: [{ poLineItemId: LI_UUID, quantityReceived: 1 }] });

      expect(res.status).toBe(400);
      expect(mockService.create).not.toHaveBeenCalled();
    });

    it('returns 400 when poId is not a UUID', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/receipts')
        .set('Authorization', `Bearer ${wh()}`)
        .send({ poId: 'not-a-uuid', lineItems: [{ poLineItemId: LI_UUID, quantityReceived: 1 }] });

      expect(res.status).toBe(400);
    });

    it('returns 400 when lineItems is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/receipts')
        .set('Authorization', `Bearer ${wh()}`)
        .send({ poId: PO_UUID });

      expect(res.status).toBe(400);
    });

    it('returns 400 when lineItems contains an invalid poLineItemId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/receipts')
        .set('Authorization', `Bearer ${wh()}`)
        .send({ poId: PO_UUID, lineItems: [{ poLineItemId: 'bad-uuid', quantityReceived: 1 }] });

      expect(res.status).toBe(400);
    });

    it('returns 400 when quantityReceived is negative', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/receipts')
        .set('Authorization', `Bearer ${wh()}`)
        .send({ poId: PO_UUID, lineItems: [{ poLineItemId: LI_UUID, quantityReceived: -1 }] });

      expect(res.status).toBe(400);
    });

    it('returns 400 when varianceReasonCode is an invalid enum value', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/receipts')
        .set('Authorization', `Bearer ${wh()}`)
        .send({
          poId: PO_UUID,
          lineItems: [{ poLineItemId: LI_UUID, quantityReceived: 5, varianceReasonCode: 'NOT_REAL' }],
        });

      expect(res.status).toBe(400);
    });
  });

  // ── PATCH /receipts/:id/complete — role gate ───────────────────────────────

  describe('PATCH /api/receipts/:id/complete — role gate', () => {
    it('WAREHOUSE_CLERK can complete a receipt (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/receipts/${REC_UUID}/complete`)
        .set('Authorization', `Bearer ${token(Role.WAREHOUSE_CLERK)}`);

      expect(res.status).toBe(200);
    });

    it('PROCUREMENT_MANAGER cannot complete a receipt (403)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/receipts/${REC_UUID}/complete`)
        .set('Authorization', `Bearer ${token(Role.PROCUREMENT_MANAGER)}`);

      expect(res.status).toBe(403);
      expect(mockService.complete).not.toHaveBeenCalled();
    });

    it('returns 400 when id is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/receipts/not-a-uuid/complete')
        .set('Authorization', `Bearer ${token(Role.WAREHOUSE_CLERK)}`);

      expect(res.status).toBe(400);
    });
  });

  // ── GET /receipts — role gate ──────────────────────────────────────────────

  describe('GET /api/receipts — role gate', () => {
    it.each([Role.WAREHOUSE_CLERK, Role.PROCUREMENT_MANAGER, Role.ADMINISTRATOR])(
      '%s can list receipts (200)',
      async (role) => {
        const res = await request(app.getHttpServer())
          .get('/api/receipts')
          .set('Authorization', `Bearer ${token(role)}`);
        expect(res.status).toBe(200);
      },
    );

    it.each([Role.PLANT_CARE_SPECIALIST, Role.SUPPLIER])(
      '%s cannot list receipts (403)',
      async (role) => {
        const res = await request(app.getHttpServer())
          .get('/api/receipts')
          .set('Authorization', `Bearer ${token(role)}`);
        expect(res.status).toBe(403);
      },
    );
  });
});
