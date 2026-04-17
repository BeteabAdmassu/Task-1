/**
 * Real-DB integration tests for /api/admin/return-policy.
 *
 * Covers:
 *   - GET returns the singleton policy row, seeded by migrations.
 *   - PATCH persists fields and returns the updated row.
 *   - PATCH validates range constraints (Min/Max on numeric fields).
 *   - RBAC: non-ADMINISTRATOR is 403; unauthenticated is 401.
 *
 * This is true no-mock: real TypeORM + migrations + ReturnPolicy entity.
 * ReturnsService is imported fresh from the module and given its full real
 * dependency graph.
 */

const TEST_JWT_SECRET = 'return-policy-integration-secret-long-enough-32!';
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

import { ReturnPolicyController } from '../../../server/src/returns/return-policy.controller';
import { ReturnsModule } from '../../../server/src/returns/returns.module';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';
import { typeOrmConfig } from '../../../server/src/config/typeorm.config';

const RUN_TAG = `rpol_${Date.now()}`;

describe('Return Policy — real-DB integration', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  const ids: { adminId?: string; pmId?: string } = {};
  // Remember the starting policy so afterAll can restore it.
  let snapshot:
    | {
        returnWindowDays: number;
        restockingFeeDefault: number;
        restockingFeeAfterDaysThreshold: number;
        restockingFeeAfterDays: number;
      }
    | null = null;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...typeOrmConfig, migrationsRun: true }),
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
        ReturnsModule,
      ],
      controllers: [ReturnPolicyController],
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
      ids.pmId = await ins(`${RUN_TAG}_pm`, Role.PROCUREMENT_MANAGER);

      const p = await qr.query(`SELECT * FROM return_policies WHERE id = 1`);
      if (p.length > 0) {
        snapshot = {
          returnWindowDays: Number(p[0].returnWindowDays),
          restockingFeeDefault: Number(p[0].restockingFeeDefault),
          restockingFeeAfterDaysThreshold: Number(
            p[0].restockingFeeAfterDaysThreshold,
          ),
          restockingFeeAfterDays: Number(p[0].restockingFeeAfterDays),
        };
      }
    } finally {
      await qr.release();
    }
  });

  afterAll(async () => {
    // Restore the singleton so other test files see the original values.
    if (snapshot) {
      const qr = ds.createQueryRunner();
      await qr.connect();
      try {
        await qr.query(
          `UPDATE return_policies SET
             "returnWindowDays" = $1,
             "restockingFeeDefault" = $2,
             "restockingFeeAfterDaysThreshold" = $3,
             "restockingFeeAfterDays" = $4
           WHERE id = 1`,
          [
            snapshot.returnWindowDays,
            snapshot.restockingFeeDefault,
            snapshot.restockingFeeAfterDaysThreshold,
            snapshot.restockingFeeAfterDays,
          ],
        );
      } finally {
        await qr.release();
      }
    }
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
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
  const asAdmin = () => token(ids.adminId!, Role.ADMINISTRATOR);
  const asPm = () => token(ids.pmId!, Role.PROCUREMENT_MANAGER);

  // ── RBAC ──────────────────────────────────────────────────────────────────

  describe('authentication & RBAC', () => {
    it('401 without bearer', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/admin/return-policy',
      );
      expect(res.status).toBe(401);
    });

    it('403 for PROCUREMENT_MANAGER (ADMIN only)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/return-policy')
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(403);
    });

    it('403 for PM on PATCH', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/admin/return-policy')
        .set('Authorization', `Bearer ${asPm()}`)
        .send({ returnWindowDays: 30 });
      expect(res.status).toBe(403);
    });
  });

  // ── Read ─────────────────────────────────────────────────────────────────

  describe('GET /api/admin/return-policy', () => {
    it('returns the singleton policy with expected numeric fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/return-policy')
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          id: 1,
          returnWindowDays: expect.any(Number),
        }),
      );
      expect(Number(res.body.restockingFeeDefault)).toBeGreaterThanOrEqual(0);
      expect(Number(res.body.restockingFeeAfterDaysThreshold)).toBeGreaterThanOrEqual(0);
      expect(Number(res.body.restockingFeeAfterDays)).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Update ────────────────────────────────────────────────────────────────

  describe('PATCH /api/admin/return-policy', () => {
    it('persists a partial update and round-trips via GET', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/admin/return-policy')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ returnWindowDays: 21, restockingFeeDefault: 10 });
      expect(res.status).toBe(200);
      expect(Number(res.body.returnWindowDays)).toBe(21);
      expect(Number(res.body.restockingFeeDefault)).toBe(10);

      // Verify round-trip from a fresh GET request
      const get = await request(app.getHttpServer())
        .get('/api/admin/return-policy')
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(get.status).toBe(200);
      expect(Number(get.body.returnWindowDays)).toBe(21);
      expect(Number(get.body.restockingFeeDefault)).toBe(10);
    });

    it('400 when returnWindowDays is below the @Min(1) boundary', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/admin/return-policy')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ returnWindowDays: 0 });
      expect(res.status).toBe(400);
    });

    it('400 when returnWindowDays exceeds @Max(365)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/admin/return-policy')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ returnWindowDays: 400 });
      expect(res.status).toBe(400);
    });

    it('400 when restockingFeeDefault exceeds 100%', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/admin/return-policy')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ restockingFeeDefault: 150 });
      expect(res.status).toBe(400);
    });

    it('400 when a forbidden field is sent (whitelist)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/admin/return-policy')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ returnWindowDays: 14, hackTheGibson: true });
      expect(res.status).toBe(400);
    });
  });
});
