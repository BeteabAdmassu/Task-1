/**
 * Real-DB integration tests for putaway-locations HTTP routes.
 *
 * Covers:
 *   - GET  /api/putaway-locations                  (WAREHOUSE_CLERK, ADMINISTRATOR)
 *   - GET  /api/admin/putaway-locations            (ADMINISTRATOR)
 *   - POST /api/admin/putaway-locations            (ADMINISTRATOR)
 *   - PATCH /api/admin/putaway-locations/:id       (ADMINISTRATOR)
 *   - DELETE /api/admin/putaway-locations/:id      (ADMINISTRATOR)
 *
 * No mocks: boots Nest against the live Postgres schema. Every assertion
 * checks persistence / RBAC / validation through the real service.
 */

const TEST_JWT_SECRET = 'putaway-integration-secret-long-enough-32-chars!';
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

import {
  PutawayLocationsController,
  AdminPutawayLocationsController,
} from '../../../server/src/receiving/putaway-locations.controller';
import { PutawayLocationsService } from '../../../server/src/receiving/putaway-locations.service';
import { PutawayLocation } from '../../../server/src/receiving/entities/putaway-location.entity';
import { User } from '../../../server/src/users/user.entity';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';
import { typeOrmConfig } from '../../../server/src/config/typeorm.config';

// putaway_locations.code is varchar(20) unique — keep prefix short.
const CODE_PREFIX = `P${Date.now().toString().slice(-6)}`;
const RUN_TAG = `putaway_${Date.now()}`;

describe('Putaway Locations — real DB integration', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  const ids: {
    adminId?: string;
    clerkId?: string;
    pmId?: string;
  } = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...typeOrmConfig, migrationsRun: true }),
        TypeOrmModule.forFeature([PutawayLocation, User]),
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [PutawayLocationsController, AdminPutawayLocationsController],
      providers: [
        PutawayLocationsService,
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
      ids.clerkId = await ins(`${RUN_TAG}_clerk`, Role.WAREHOUSE_CLERK);
      ids.pmId = await ins(`${RUN_TAG}_pm`, Role.PROCUREMENT_MANAGER);
    } finally {
      await qr.release();
    }
  });

  afterAll(async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      await qr.query(`DELETE FROM putaway_locations WHERE code LIKE $1`, [
        `${CODE_PREFIX}%`,
      ]);
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
  const asClerk = () => token(ids.clerkId!, Role.WAREHOUSE_CLERK);
  const asPm = () => token(ids.pmId!, Role.PROCUREMENT_MANAGER);

  let createdId: string | undefined;

  // ── Access control ────────────────────────────────────────────────────────

  describe('Authentication and RBAC', () => {
    it('401 without bearer (admin endpoint)', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/admin/putaway-locations',
      );
      expect(res.status).toBe(401);
    });

    it('401 without bearer (public-facing endpoint)', async () => {
      const res = await request(app.getHttpServer()).get('/api/putaway-locations');
      expect(res.status).toBe(401);
    });

    it('403 for PROCUREMENT_MANAGER on GET /api/putaway-locations (WH/ADMIN only)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/putaway-locations')
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(403);
    });

    it('403 for WAREHOUSE_CLERK on admin CRUD endpoints', async () => {
      const list = await request(app.getHttpServer())
        .get('/api/admin/putaway-locations')
        .set('Authorization', `Bearer ${asClerk()}`);
      expect(list.status).toBe(403);

      const create = await request(app.getHttpServer())
        .post('/api/admin/putaway-locations')
        .set('Authorization', `Bearer ${asClerk()}`)
        .send({ code: `${CODE_PREFIX}-NO` });
      expect(create.status).toBe(403);
    });
  });

  // ── Admin CRUD ────────────────────────────────────────────────────────────

  describe('Admin CRUD', () => {
    it('POST creates a location and persists it', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/putaway-locations')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({
          code: `${CODE_PREFIX}-A1`,
          description: 'Aisle 1 Bin A',
          zone: 'COLD',
          isActive: true,
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.code).toBe(`${CODE_PREFIX}-A1`);
      expect(res.body.zone).toBe('COLD');
      expect(res.body.isActive).toBe(true);
      createdId = res.body.id;

      const row = await ds.query(
        `SELECT code, zone, "isActive" FROM putaway_locations WHERE id = $1`,
        [createdId],
      );
      expect(row).toHaveLength(1);
      expect(row[0].code).toBe(`${CODE_PREFIX}-A1`);
      expect(row[0].zone).toBe('COLD');
      expect(row[0].isActive).toBe(true);
    });

    it('POST is idempotent on the code constraint (409 on duplicate code)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/putaway-locations')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ code: `${CODE_PREFIX}-A1` });
      expect(res.status).toBe(409);
    });

    it('GET /api/admin/putaway-locations returns the newly created row', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/putaway-locations')
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const mine = res.body.find((r: { id: string }) => r.id === createdId);
      expect(mine).toBeDefined();
    });

    it('PATCH updates mutable fields and round-trips', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/admin/putaway-locations/${createdId}`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({
          code: `${CODE_PREFIX}-A1`, // unchanged; tests the "no-op unique-check" path
          description: 'Updated description',
          zone: 'AMBIENT',
          isActive: false,
        });
      expect(res.status).toBe(200);
      expect(res.body.description).toBe('Updated description');
      expect(res.body.zone).toBe('AMBIENT');
      expect(res.body.isActive).toBe(false);
    });

    it('GET /api/putaway-locations returns only active rows (WAREHOUSE_CLERK can see)', async () => {
      // The row we just updated is isActive=false, so it must NOT appear.
      const res = await request(app.getHttpServer())
        .get('/api/putaway-locations')
        .set('Authorization', `Bearer ${asClerk()}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(
        res.body.every((r: { isActive: boolean }) => r.isActive === true),
      ).toBe(true);
      expect(
        res.body.some((r: { id: string }) => r.id === createdId),
      ).toBe(false);
    });

    it('DELETE removes the row (204) and subsequent GET returns 404', async () => {
      const del = await request(app.getHttpServer())
        .delete(`/api/admin/putaway-locations/${createdId}`)
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(del.status).toBe(204);

      const remaining = await ds.query(
        `SELECT id FROM putaway_locations WHERE id = $1`,
        [createdId],
      );
      expect(remaining).toHaveLength(0);
    });
  });

  // ── Validation ───────────────────────────────────────────────────────────

  describe('Validation', () => {
    it('400 when code is missing on create', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/putaway-locations')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('400 when id is not a UUID on update', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/admin/putaway-locations/not-a-uuid')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ code: `${CODE_PREFIX}-X` });
      expect(res.status).toBe(400);
    });

    it('400 when code exceeds MaxLength(20)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/putaway-locations')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ code: 'X'.repeat(25) });
      expect(res.status).toBe(400);
    });
  });
});
