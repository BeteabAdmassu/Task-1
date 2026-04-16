/**
 * Real-DB integration tests for Catalog endpoints.
 *
 * Covers full HTTP → DB persistence for all 5 catalog routes plus RBAC and
 * validation. Uses the live Postgres schema via migrations.
 */

const TEST_JWT_SECRET = 'catalog-integration-secret-long-enough-32!!';
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

import { CatalogController } from '../../../server/src/catalog/catalog.controller';
import { CatalogService } from '../../../server/src/catalog/catalog.service';
import { CatalogItem } from '../../../server/src/catalog/entities/catalog-item.entity';
import { DataQualityModule } from '../../../server/src/data-quality/data-quality.module';
import { Supplier } from '../../../server/src/suppliers/supplier.entity';
import { User } from '../../../server/src/users/user.entity';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';
import { typeOrmConfig } from '../../../server/src/config/typeorm.config';

const RUN_TAG = `catint_${Date.now()}`;

describe('Catalog — real DB integration', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  const ids: {
    adminId?: string;
    pmId?: string;
    clerkId?: string;
    supplierId?: string;
    createdItemId?: string;
  } = {};

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...typeOrmConfig, migrationsRun: true }),
        TypeOrmModule.forFeature([CatalogItem, Supplier, User]),
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
        DataQualityModule,
      ],
      controllers: [CatalogController],
      providers: [
        CatalogService,
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = module.createNestApplication();
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

    ds = module.get(DataSource);
    jwtService = module.get(JwtService);

    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const insertUser = async (u: string, r: string) => {
        const rows = await qr.query(
          `INSERT INTO users (username, "passwordHash", role, "isActive", "mustChangePassword")
           VALUES ($1, 'not-a-real-hash', $2, true, false) RETURNING id`,
          [u, r],
        );
        return rows[0].id as string;
      };
      ids.adminId = await insertUser(`${RUN_TAG}_admin`, Role.ADMINISTRATOR);
      ids.pmId = await insertUser(`${RUN_TAG}_pm`, Role.PROCUREMENT_MANAGER);
      ids.clerkId = await insertUser(`${RUN_TAG}_clerk`, Role.WAREHOUSE_CLERK);

      const sup = await qr.query(
        `INSERT INTO suppliers (name, "paymentTerms", "isActive")
         VALUES ($1, 'NET_30', true) RETURNING id`,
        [`${RUN_TAG}_supplier`],
      );
      ids.supplierId = sup[0].id as string;

      // Pre-seed two catalog items so list/search tests have guaranteed data.
      await qr.query(
        `INSERT INTO catalog_items (title, "supplierId", "unitPrice", "isActive")
         VALUES ($1, $2, 9.99, true), ($3, $2, 14.50, true)`,
        [`${RUN_TAG} widget A`, ids.supplierId, `${RUN_TAG} widget B`],
      );
    } finally {
      await qr.release();
    }
  });

  afterAll(async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      await qr.query(`DELETE FROM catalog_items WHERE title LIKE $1`, [
        `${RUN_TAG}%`,
      ]);
      await qr.query(`DELETE FROM suppliers WHERE name LIKE $1`, [
        `${RUN_TAG}%`,
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
  const asPm = () => token(ids.pmId!, Role.PROCUREMENT_MANAGER);
  const asClerk = () => token(ids.clerkId!, Role.WAREHOUSE_CLERK);

  // ── Access control ────────────────────────────────────────────────────────

  describe('Authentication and RBAC', () => {
    it('401 without bearer', async () => {
      const res = await request(app.getHttpServer()).get('/api/catalog');
      expect(res.status).toBe(401);
    });

    it('403 for WAREHOUSE_CLERK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/catalog')
        .set('Authorization', `Bearer ${asClerk()}`);
      expect(res.status).toBe(403);
    });

    it('200 for PROCUREMENT_MANAGER', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/catalog')
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(200);
    });
  });

  // ── Create / read / update ───────────────────────────────────────────────

  describe('Create and read', () => {
    it('POST /catalog creates an item and stores a fingerprint', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/catalog')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({
          title: `${RUN_TAG} potting mix`,
          supplierId: ids.supplierId,
          unitSize: '40lb',
          upc: '123456789012',
          unitPrice: 19.95,
          description: 'Premium potting mix',
          isActive: true,
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.fingerprint).toBeDefined();
      ids.createdItemId = res.body.id;

      const row = await ds.query(
        `SELECT title, "unitPrice", "isActive" FROM catalog_items WHERE id = $1`,
        [res.body.id],
      );
      expect(row).toHaveLength(1);
      expect(Number(row[0].unitPrice)).toBe(19.95);
      expect(row[0].isActive).toBe(true);
    });

    it('GET /catalog filters by search term against title (ILIKE)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/catalog?search=${encodeURIComponent(RUN_TAG)}`)
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(200);
      // We expect the 2 seeded + 1 created = 3 for this tag.
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
      expect(
        res.body.data.every((i: { title: string }) =>
          i.title.includes(RUN_TAG),
        ),
      ).toBe(true);
    });

    it('GET /catalog/:id returns one item', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/catalog/${ids.createdItemId}`)
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ids.createdItemId);
    });

    it('GET /catalog/dropdown returns a minimal list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/catalog/dropdown')
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Update', () => {
    it('PATCH /catalog/:id updates fields and persists them', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/catalog/${ids.createdItemId}`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ unitPrice: 24.5, isActive: false });
      expect(res.status).toBe(200);
      expect(Number(res.body.unitPrice)).toBe(24.5);
      expect(res.body.isActive).toBe(false);

      const row = await ds.query(
        `SELECT "unitPrice", "isActive" FROM catalog_items WHERE id = $1`,
        [ids.createdItemId],
      );
      expect(Number(row[0].unitPrice)).toBe(24.5);
      expect(row[0].isActive).toBe(false);
    });
  });

  // ── Validation ───────────────────────────────────────────────────────────

  describe('DTO validation', () => {
    it('400 when required title is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/catalog')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ unitPrice: 1 });
      expect(res.status).toBe(400);
    });

    it('400 when unitPrice is negative', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/catalog')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ title: `${RUN_TAG} bad`, unitPrice: -1 });
      expect(res.status).toBe(400);
    });

    it('400 when supplierId is not a UUID', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/catalog')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ title: `${RUN_TAG} bad`, supplierId: 'not-a-uuid' });
      expect(res.status).toBe(400);
    });

    it('404 when fetching a non-existent item', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/catalog/00000000-0000-0000-0000-000000000404')
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(404);
    });
  });
});
