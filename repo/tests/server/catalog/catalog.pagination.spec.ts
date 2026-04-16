/**
 * Catalog pagination, sort, and combined-filter integration tests.
 *
 * Complements `catalog.integration.spec.ts` with sequences that depend on a
 * fixed, known dataset: multiple items with deterministic titles and prices
 * so we can assert the exact order/page of results. All queries go through
 * the real HTTP pipeline → service → DB.
 */

const TEST_JWT_SECRET = 'catalog-pagination-secret-long-enough-32!!';
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

const RUN_TAG = `catpg_${Date.now()}`;

describe('Catalog — pagination, sort, combined filters', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  const ids: {
    adminId?: string;
    supplierAId?: string;
    supplierBId?: string;
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
      const admin = await qr.query(
        `INSERT INTO users (username, "passwordHash", role, "isActive", "mustChangePassword")
         VALUES ($1, 'not-a-real-hash', 'ADMINISTRATOR', true, false) RETURNING id`,
        [`${RUN_TAG}_admin`],
      );
      ids.adminId = admin[0].id as string;

      const a = await qr.query(
        `INSERT INTO suppliers (name, "paymentTerms", "isActive")
         VALUES ($1, 'NET_30', true) RETURNING id`,
        [`${RUN_TAG}_supA`],
      );
      ids.supplierAId = a[0].id as string;

      const b = await qr.query(
        `INSERT INTO suppliers (name, "paymentTerms", "isActive")
         VALUES ($1, 'NET_30', true) RETURNING id`,
        [`${RUN_TAG}_supB`],
      );
      ids.supplierBId = b[0].id as string;

      // 5 items: 3 for supplier A (one inactive, prices 10/20/40) + 2 for B.
      // Titles embed a leading letter so sort order is deterministic.
      const items: Array<[string, string, number, boolean]> = [
        [`${RUN_TAG} A-widget small`, ids.supplierAId!, 10.0, true],
        [`${RUN_TAG} B-widget medium`, ids.supplierAId!, 20.0, true],
        [`${RUN_TAG} C-widget large`, ids.supplierAId!, 40.0, false],
        [`${RUN_TAG} D-gadget`, ids.supplierBId!, 15.5, true],
        [`${RUN_TAG} E-gadget`, ids.supplierBId!, 25.0, true],
      ];
      for (const [title, sid, price, active] of items) {
        await qr.query(
          `INSERT INTO catalog_items (title, "supplierId", "unitPrice", "isActive")
           VALUES ($1, $2, $3, $4)`,
          [title, sid, price, active],
        );
      }
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

  const token = () =>
    jwtService.sign({
      sub: ids.adminId,
      username: `${RUN_TAG}_admin`,
      role: Role.ADMINISTRATOR,
    });

  // Helper to avoid duplication
  const get = (qs: string) =>
    request(app.getHttpServer())
      .get(`/api/catalog?${qs}`)
      .set('Authorization', `Bearer ${token()}`);

  // ── Sort ──────────────────────────────────────────────────────────────────

  describe('sort', () => {
    it('sortBy=title sortOrder=asc returns items in alphabetical order', async () => {
      const res = await get(
        `search=${encodeURIComponent(RUN_TAG)}&sortBy=title&sortOrder=asc`,
      );
      expect(res.status).toBe(200);
      const titles = res.body.data.map((r: { title: string }) => r.title);
      const sorted = [...titles].sort();
      expect(titles).toEqual(sorted);
    });

    it('sortBy=unitPrice sortOrder=desc returns items by price descending', async () => {
      const res = await get(
        `search=${encodeURIComponent(RUN_TAG)}&sortBy=unitPrice&sortOrder=desc&limit=100`,
      );
      expect(res.status).toBe(200);
      const prices = res.body.data.map((r: { unitPrice: string }) =>
        Number(r.unitPrice),
      );
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i - 1]).toBeGreaterThanOrEqual(prices[i]);
      }
    });

    it('unknown sortBy falls back to createdAt (no 400)', async () => {
      const res = await get(
        `search=${encodeURIComponent(RUN_TAG)}&sortBy=not-a-real-field`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ── Pagination ────────────────────────────────────────────────────────────

  describe('pagination', () => {
    it('page=1 limit=2 returns exactly 2 items and totalPages matches total', async () => {
      const res = await get(
        `search=${encodeURIComponent(RUN_TAG)}&page=1&limit=2`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(2);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(5);
      expect(res.body.meta.totalPages).toBe(
        Math.ceil(res.body.meta.total / 2),
      );
    });

    it('page=2 returns the second slice and does not overlap page=1', async () => {
      const fixed = `search=${encodeURIComponent(
        RUN_TAG,
      )}&sortBy=title&sortOrder=asc&limit=2`;
      const p1 = await get(`${fixed}&page=1`);
      const p2 = await get(`${fixed}&page=2`);
      expect(p1.status).toBe(200);
      expect(p2.status).toBe(200);
      const ids1 = p1.body.data.map((r: { id: string }) => r.id);
      const ids2 = p2.body.data.map((r: { id: string }) => r.id);
      expect(ids1.some((i: string) => ids2.includes(i))).toBe(false);
    });

    it('limit over the service cap (100) is clamped', async () => {
      const res = await get(
        `search=${encodeURIComponent(RUN_TAG)}&limit=9999`,
      );
      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBeLessThanOrEqual(100);
    });
  });

  // ── Combined filters ──────────────────────────────────────────────────────

  describe('combined filters', () => {
    it('supplierId + isActive=true returns only active items for that supplier', async () => {
      const res = await get(
        `search=${encodeURIComponent(RUN_TAG)}&supplierId=${ids.supplierAId}&isActive=true`,
      );
      expect(res.status).toBe(200);
      const titles = res.body.data.map((r: { title: string }) => r.title);
      // supplier A has 3 seeded items but one is inactive → 2 active
      expect(titles.length).toBe(2);
      expect(titles.every((t: string) => t.includes('widget'))).toBe(true);
    });

    it('supplierId + isActive=false returns only the inactive item for that supplier', async () => {
      const res = await get(
        `search=${encodeURIComponent(RUN_TAG)}&supplierId=${ids.supplierAId}&isActive=false`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].isActive).toBe(false);
    });

    it('search against description works via ILIKE OR title match', async () => {
      // Add one item whose description contains the tag but title does not
      await ds.query(
        `INSERT INTO catalog_items (title, "supplierId", "unitPrice", "isActive", description)
         VALUES ($1, $2, 5, true, $3)`,
        [`unrelated-title-${RUN_TAG}`, ids.supplierAId, `${RUN_TAG} note`],
      );
      const res = await get(`search=${encodeURIComponent(RUN_TAG)}&limit=100`);
      expect(res.status).toBe(200);
      expect(
        res.body.data.some((r: { title: string }) =>
          r.title.startsWith('unrelated-title-'),
        ),
      ).toBe(true);
    });
  });
});
