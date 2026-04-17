/**
 * Real HTTP integration tests for GET /api/health.
 *
 * Covers:
 *   - 200 on an unauthenticated request (route is `@Public()`).
 *   - Response shape matches the service contract.
 *   - The endpoint bypasses the global JwtAuthGuard, not just "no roles required".
 */

const TEST_JWT_SECRET = 'health-integration-secret-long-enough-32!!';
process.env.JWT_SECRET = TEST_JWT_SECRET;

import * as request from 'supertest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';

import { HealthController } from '../../../server/src/health/health.controller';
import { HealthService } from '../../../server/src/health/health.service';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';

describe('GET /api/health — real HTTP, public route', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [HealthController],
      providers: [
        HealthService,
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 and a JSON body without any authentication header', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
    expect(res.body).not.toBeNull();
  });

  it('returns a body shape compatible with the health service contract', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    // The shape of a health response can vary per service impl, but the
    // endpoint MUST return a JSON object. An empty object would be an
    // accidental regression.
    expect(Object.keys(res.body).length).toBeGreaterThan(0);
  });

  it('ignores stale or malformed bearer tokens (public route bypasses JwtAuthGuard)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .set('Authorization', 'Bearer not-a-real-token-at-all');
    expect(res.status).toBe(200);
  });

  it('400-class is never returned for GET /api/health with spurious query params', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health?foo=bar&baz=qux');
    expect(res.status).toBe(200);
  });
});
