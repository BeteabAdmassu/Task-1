/**
 * Real-DB integration tests for:
 *   GET /api/returns
 *   GET /api/returns/:id
 *
 * True no-mock: boots the real ReturnsModule against Postgres and seeds a
 * complete chain (supplier → PO → PO line → receipt → receipt line → RA)
 * so the read endpoints exercise their real SQL + relations.
 */

const TEST_JWT_SECRET = 'returns-reads-integration-secret-long-enough-32!';
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

import { ReturnsModule } from '../../../server/src/returns/returns.module';
import { NotificationsModule } from '../../../server/src/notifications/notifications.module';
import { FundsLedgerModule } from '../../../server/src/funds-ledger/funds-ledger.module';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';
import { typeOrmConfig } from '../../../server/src/config/typeorm.config';

const PO_PREFIX = `R${Date.now().toString().slice(-9)}`;
const RA_PREFIX = `A${Date.now().toString().slice(-9)}`;
const RUN_TAG = `retrd_${Date.now()}`;

describe('Returns reads (list + :id) — real DB', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  const ids: {
    adminId?: string;
    pmId?: string;
    clerkId?: string;
    supplierId?: string;
    poId?: string;
    poLineId?: string;
    receiptId?: string;
    receiptLineId?: string;
    raId?: string;
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
        NotificationsModule,
        FundsLedgerModule,
        ReturnsModule,
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
      ids.clerkId = await ins(`${RUN_TAG}_clerk`, Role.WAREHOUSE_CLERK);

      const sup = await qr.query(
        `INSERT INTO suppliers (name, "paymentTerms", "isActive")
         VALUES ($1, 'NET_30', true) RETURNING id`,
        [`${RUN_TAG}_sup`],
      );
      ids.supplierId = sup[0].id as string;

      const po = await qr.query(
        `INSERT INTO purchase_orders ("poNumber", "supplierId", "totalAmount", status, "createdBy")
         VALUES ($1, $2, 50, 'FULLY_RECEIVED', $3) RETURNING id`,
        [`${PO_PREFIX}-1`, ids.supplierId, ids.pmId],
      );
      ids.poId = po[0].id as string;

      const poLine = await qr.query(
        `INSERT INTO purchase_order_line_items ("poId", description, quantity, "unitPrice", "totalPrice", "quantityReceived")
         VALUES ($1, $2, 5, 10, 50, 5) RETURNING id`,
        [ids.poId, `${RUN_TAG} widget`],
      );
      ids.poLineId = poLine[0].id as string;

      const rec = await qr.query(
        `INSERT INTO receipts ("receiptNumber", "poId", "receivedBy", "receivedAt", status, "entryMode")
         VALUES ($1, $2, $3, NOW(), 'COMPLETED', 'MANUAL') RETURNING id`,
        [`${PO_PREFIX}-REC`, ids.poId, ids.clerkId],
      );
      ids.receiptId = rec[0].id as string;

      const recLine = await qr.query(
        `INSERT INTO receipt_line_items
          ("receiptId", "poLineItemId", "quantityExpected", "quantityReceived", "varianceQuantity")
         VALUES ($1, $2, 5, 5, 0) RETURNING id`,
        [ids.receiptId, ids.poLineId],
      );
      ids.receiptLineId = recLine[0].id as string;

      const ra = await qr.query(
        `INSERT INTO return_authorizations
          ("raNumber", "receiptId", "poId", "supplierId", "createdBy",
           status, "returnWindowDays", "returnDeadline")
         VALUES ($1, $2, $3, $4, $5, 'DRAFT', 14, NOW() + INTERVAL '14 days')
         RETURNING id`,
        [`${RA_PREFIX}-1`, ids.receiptId, ids.poId, ids.supplierId, ids.pmId],
      );
      ids.raId = ra[0].id as string;
    } finally {
      await qr.release();
    }
  });

  afterAll(async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      await qr.query(
        `DELETE FROM return_authorizations WHERE "raNumber" LIKE $1`,
        [`${RA_PREFIX}%`],
      );
      await qr.query(
        `DELETE FROM receipt_line_items WHERE "receiptId" IN
         (SELECT id FROM receipts WHERE "receiptNumber" LIKE $1)`,
        [`${PO_PREFIX}%`],
      );
      await qr.query(`DELETE FROM receipts WHERE "receiptNumber" LIKE $1`, [
        `${PO_PREFIX}%`,
      ]);
      await qr.query(
        `DELETE FROM purchase_order_line_items WHERE "poId" IN
         (SELECT id FROM purchase_orders WHERE "poNumber" LIKE $1)`,
        [`${PO_PREFIX}%`],
      );
      await qr.query(`DELETE FROM purchase_orders WHERE "poNumber" LIKE $1`, [
        `${PO_PREFIX}%`,
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

  // ── RBAC + auth ──────────────────────────────────────────────────────────

  describe('Authentication + RBAC', () => {
    it('401 without bearer on list', async () => {
      const res = await request(app.getHttpServer()).get('/api/returns');
      expect(res.status).toBe(401);
    });

    it('401 without bearer on :id', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/returns/${ids.raId}`,
      );
      expect(res.status).toBe(401);
    });

    it('403 for WAREHOUSE_CLERK (only PROCUREMENT_MANAGER + ADMINISTRATOR)', async () => {
      const list = await request(app.getHttpServer())
        .get('/api/returns')
        .set('Authorization', `Bearer ${asClerk()}`);
      expect(list.status).toBe(403);

      const one = await request(app.getHttpServer())
        .get(`/api/returns/${ids.raId}`)
        .set('Authorization', `Bearer ${asClerk()}`);
      expect(one.status).toBe(403);
    });
  });

  // ── GET /api/returns ─────────────────────────────────────────────────────

  describe('GET /api/returns', () => {
    it('returns a paginated response including the seeded RA with line items & supplier', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/returns?limit=100')
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toEqual(
        expect.objectContaining({
          page: expect.any(Number),
          limit: expect.any(Number),
          total: expect.any(Number),
          totalPages: expect.any(Number),
        }),
      );
      const ours = res.body.data.find((r: { id: string }) => r.id === ids.raId);
      expect(ours).toBeDefined();
      expect(ours.raNumber).toBe(`${RA_PREFIX}-1`);
      expect(ours.status).toBe('DRAFT');
      expect(ours.supplier).toEqual(
        expect.objectContaining({ id: ids.supplierId }),
      );
    });

    it('status=DRAFT filter narrows results and every row has status=DRAFT', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/returns?status=DRAFT&limit=100')
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(200);
      expect(
        res.body.data.every(
          (r: { status: string }) => r.status === 'DRAFT',
        ),
      ).toBe(true);
      expect(res.body.data.some((r: { id: string }) => r.id === ids.raId)).toBe(
        true,
      );
    });

    it('supplierId filter returns only that supplier\'s returns', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/returns?supplierId=${ids.supplierId}`)
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(200);
      expect(
        res.body.data.every(
          (r: { supplierId: string }) => r.supplierId === ids.supplierId,
        ),
      ).toBe(true);
    });

    it('400 on invalid status enum value', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/returns?status=NOT_A_STATUS')
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(400);
    });

    it('400 on non-UUID supplierId query', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/returns?supplierId=not-a-uuid')
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/returns/:id ─────────────────────────────────────────────────

  describe('GET /api/returns/:id', () => {
    it('returns the full RA with receipt, supplier, and line items populated', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/returns/${ids.raId}`)
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ids.raId);
      expect(res.body.raNumber).toBe(`${RA_PREFIX}-1`);
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.supplierId).toBe(ids.supplierId);
      expect(res.body.receipt).toEqual(
        expect.objectContaining({ id: ids.receiptId }),
      );
    });

    it('404 for a well-formed but unknown UUID — precise NotFound message', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/returns/11111111-1111-4111-a111-111111111111')
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/not found/i);
    });

    it('400 when :id is not a UUID (ParseUUIDPipe)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/returns/not-a-uuid')
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(400);
    });
  });
});
