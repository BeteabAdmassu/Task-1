/**
 * Integration tests for the payment callback endpoint.
 *
 * Covers:
 *  - Valid callback is processed and stored (200)
 *  - Duplicate callback with the same idempotency key returns cached result without re-processing
 *  - Missing idempotency key → 400
 *  - Failed connector signature verification → 401
 *  - Idempotency key resolved from X-Idempotency-Key header when body key is absent
 */

process.env.JWT_SECRET = 'callback-test-secret-32chars-xxxx!!';

import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { PaymentCallbackController } from './payment-callback.controller';
import { PAYMENT_CONNECTOR, IPaymentConnector } from './interfaces/payment-connector.interface';
import { PaymentIdempotencyKey } from './entities/payment-idempotency-key.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';

describe('POST /api/payments/callback', () => {
  let app: INestApplication;

  // Connector mock — by default verifyCallback returns true (noop behaviour)
  const mockConnector: IPaymentConnector = {
    name: 'noop',
    processPayment: jest.fn(),
    processRefund: jest.fn(),
    getStatus: jest.fn(),
    verifyCallback: jest.fn().mockReturnValue(true),
  };

  // idempotency key store — starts empty
  const stored: Map<string, PaymentIdempotencyKey> = new Map();
  const idempotencyRepo = {
    findOne: jest.fn(async ({ where: { key } }: { where: { key: string } }) =>
      stored.get(key) ?? null,
    ),
    save: jest.fn(async (data: Partial<PaymentIdempotencyKey>) => {
      const record = { ...data } as PaymentIdempotencyKey;
      stored.set(data.key!, record);
      return record;
    }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: process.env.JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [PaymentCallbackController],
      providers: [
        JwtStrategy,
        { provide: PAYMENT_CONNECTOR, useValue: mockConnector },
        { provide: getRepositoryToken(PaymentIdempotencyKey), useValue: idempotencyRepo },
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
  });

  afterAll(() => app.close());

  beforeEach(() => {
    stored.clear();
    jest.clearAllMocks();
    (mockConnector.verifyCallback as jest.Mock).mockReturnValue(true);
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('returns 200 and processes a new callback', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/payments/callback')
      .send({
        idempotencyKey: 'unique-key-001',
        connectorName: 'noop',
        event: 'payment.succeeded',
        payload: { amount: 500 },
      });

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(true);
    expect(res.body.alreadyProcessed).toBe(false);
    expect(res.body.result.event).toBe('payment.succeeded');
    expect(res.body.result.success).toBe(true);
  });

  // ── Idempotency: duplicate callback ────────────────────────────────────────

  it('returns the cached result without re-processing on a duplicate callback', async () => {
    // First call
    await request(app.getHttpServer())
      .post('/api/payments/callback')
      .send({ idempotencyKey: 'duplicate-key', event: 'payment.succeeded' });

    // Duplicate call — same key
    const res = await request(app.getHttpServer())
      .post('/api/payments/callback')
      .send({ idempotencyKey: 'duplicate-key', event: 'payment.succeeded' });

    expect(res.status).toBe(200);
    expect(res.body.alreadyProcessed).toBe(true);
    // save must have been called only once (for the first call)
    expect(idempotencyRepo.save).toHaveBeenCalledTimes(1);
  });

  // ── Idempotency key from header ─────────────────────────────────────────────

  it('resolves idempotency key from X-Idempotency-Key header when body key is absent', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/payments/callback')
      .set('X-Idempotency-Key', 'header-key-999')
      .send({ event: 'refund.created' });

    expect(res.status).toBe(200);
    expect(res.body.alreadyProcessed).toBe(false);
    expect(stored.has('header-key-999')).toBe(true);
  });

  // ── Missing idempotency key → 400 ──────────────────────────────────────────

  it('returns 400 when no idempotency key is provided in body or header', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/payments/callback')
      .send({ event: 'payment.succeeded' });

    expect(res.status).toBe(400);
  });

  // ── Invalid signature → 401 ────────────────────────────────────────────────

  it('returns 401 when connector signature verification fails', async () => {
    (mockConnector.verifyCallback as jest.Mock).mockReturnValue(false);

    const res = await request(app.getHttpServer())
      .post('/api/payments/callback')
      .send({ idempotencyKey: 'sig-fail-key', event: 'payment.succeeded' });

    expect(res.status).toBe(401);
    // Nothing should have been stored
    expect(stored.size).toBe(0);
  });
});
