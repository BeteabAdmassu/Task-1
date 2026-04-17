/**
 * Real-HTTP integration tests for GET /api/supplier-portal/profile.
 *
 * The existing `supplier-portal.controller.spec.ts` unit-tests the controller
 * method directly but never spins up HTTP. This suite boots the app via the
 * SuppliersModule (no mocks) and verifies the full HTTP → guard → controller
 * → DB pipeline — including RBAC, supplier-user linkage lookup, and the
 * sensitive-field-filtering contract the portal promises.
 */

const TEST_JWT_SECRET = 'supplier-profile-integration-secret-32-chars!!';
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

import { SuppliersModule } from '../../../server/src/suppliers/suppliers.module';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';
import { typeOrmConfig } from '../../../server/src/config/typeorm.config';

const RUN_TAG = `spprof_${Date.now()}`;

describe('GET /api/supplier-portal/profile — real HTTP + DB', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  const ids: {
    supplierAId?: string;
    supplierBId?: string;
    supplierAUserId?: string;
    orphanSupplierUserId?: string;
    adminId?: string;
  } = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...typeOrmConfig, migrationsRun: true }),
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
        SuppliersModule,
      ],
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
      // Two suppliers; A is linked to a supplier-user, B is not.
      const a = await qr.query(
        `INSERT INTO suppliers (name, "contactName", email, phone, "paymentTerms",
                                "bankingNotes", "internalRiskFlag", "budgetCap", "isActive")
         VALUES ($1, 'Ada Lovelace', 'a@example.com', '+1-555-0001', 'NET_30',
                 'Routing 1234', 'low', 50000, true) RETURNING id`,
        [`${RUN_TAG}_supA`],
      );
      ids.supplierAId = a[0].id as string;

      const b = await qr.query(
        `INSERT INTO suppliers (name, "paymentTerms", "isActive")
         VALUES ($1, 'NET_30', true) RETURNING id`,
        [`${RUN_TAG}_supB`],
      );
      ids.supplierBId = b[0].id as string;

      const ins = async (u: string, role: string, supplierId?: string) => {
        const rows = await qr.query(
          `INSERT INTO users (username, "passwordHash", role, "isActive", "mustChangePassword", "supplierId")
           VALUES ($1, 'not-a-real-hash', $2, true, false, $3) RETURNING id`,
          [u, role, supplierId ?? null],
        );
        return rows[0].id as string;
      };
      ids.supplierAUserId = await ins(
        `${RUN_TAG}_supA_user`,
        Role.SUPPLIER,
        ids.supplierAId,
      );
      ids.orphanSupplierUserId = await ins(
        `${RUN_TAG}_supOrphan`,
        Role.SUPPLIER,
      );
      ids.adminId = await ins(`${RUN_TAG}_admin`, Role.ADMINISTRATOR);
    } finally {
      await qr.release();
    }
  });

  afterAll(async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      await qr.query(`DELETE FROM users WHERE username LIKE $1`, [
        `${RUN_TAG}%`,
      ]);
      await qr.query(`DELETE FROM suppliers WHERE name LIKE $1`, [
        `${RUN_TAG}%`,
      ]);
    } finally {
      await qr.release();
    }
    await app.close();
  });

  const token = (userId: string, role: string) =>
    jwtService.sign({ sub: userId, username: `t-${role}`, role });

  describe('RBAC + authentication', () => {
    it('401 without bearer', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/supplier-portal/profile',
      );
      expect(res.status).toBe(401);
    });

    it('403 for ADMINISTRATOR (supplier portal is SUPPLIER-only)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/supplier-portal/profile')
        .set(
          'Authorization',
          `Bearer ${token(ids.adminId!, Role.ADMINISTRATOR)}`,
        );
      expect(res.status).toBe(403);
    });
  });

  describe('Happy path', () => {
    it('SUPPLIER returns their own supplier profile with ONLY safe fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/supplier-portal/profile')
        .set(
          'Authorization',
          `Bearer ${token(ids.supplierAUserId!, Role.SUPPLIER)}`,
        );
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ids.supplierAId);
      expect(res.body.name).toBe(`${RUN_TAG}_supA`);
      expect(res.body.contactName).toBe('Ada Lovelace');
      expect(res.body.email).toBe('a@example.com');

      // Sensitive fields must be stripped by the portal contract.
      expect(res.body).not.toHaveProperty('bankingNotes');
      expect(res.body).not.toHaveProperty('internalRiskFlag');
      expect(res.body).not.toHaveProperty('budgetCap');
    });
  });

  describe('Edge cases', () => {
    it('404 when the supplier user has no linked supplierId', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/supplier-portal/profile')
        .set(
          'Authorization',
          `Bearer ${token(ids.orphanSupplierUserId!, Role.SUPPLIER)}`,
        );
      expect(res.status).toBe(404);
    });
  });
});
