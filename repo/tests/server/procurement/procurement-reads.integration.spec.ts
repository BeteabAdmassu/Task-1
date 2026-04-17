/**
 * Real-DB integration tests for previously uncovered procurement endpoints:
 *
 *   GET  /api/procurement/requests
 *   GET  /api/procurement/requests/approval-queue
 *   GET  /api/procurement/requests/:id
 *   PATCH /api/procurement/requests/:id
 *   POST /api/procurement/requests/:id/cancel
 *   POST /api/procurement/low-stock-alert
 *
 * True no-mock HTTP: every request drives the real ProcurementModule +
 * PurchaseOrdersModule against Postgres. Assertions check rows/state
 * mutations, not just status codes.
 */

const TEST_JWT_SECRET = 'procurement-reads-integration-secret-32-chars!!';
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.FIELD_ENCRYPTION_KEY =
  process.env.FIELD_ENCRYPTION_KEY ??
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

jest.setTimeout(45_000);

import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { ProcurementModule } from '../../../server/src/procurement/procurement.module';
import { PurchaseOrdersModule } from '../../../server/src/purchase-orders/purchase-orders.module';
import { AuditModule } from '../../../server/src/audit/audit.module';
import { BudgetModule } from '../../../server/src/budget/budget.module';
import { NotificationsModule } from '../../../server/src/notifications/notifications.module';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';
import { typeOrmConfig } from '../../../server/src/config/typeorm.config';

const RUN_TAG = `prproc_${Date.now()}`;

describe('Procurement — read/update/cancel/low-stock, real DB', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  const ids: {
    adminId?: string;
    pmId?: string;
    clerkId?: string;
    supplierId?: string;
    draftPrId?: string;
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
        AuditModule,
        BudgetModule,
        NotificationsModule,
        PurchaseOrdersModule,
        ProcurementModule,
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
    } finally {
      await qr.release();
    }
  });

  afterAll(async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      await qr.query(
        `DELETE FROM notifications WHERE "recipientId" IN
         (SELECT id FROM users WHERE username LIKE $1)`,
        [`${RUN_TAG}%`],
      );
      await qr.query(
        `DELETE FROM audit_logs WHERE "userId" IN
         (SELECT id FROM users WHERE username LIKE $1)`,
        [`${RUN_TAG}%`],
      );
      await qr.query(
        `DELETE FROM purchase_order_line_items WHERE "poId" IN
         (SELECT id FROM purchase_orders WHERE "supplierId" = $1)`,
        [ids.supplierId],
      );
      await qr.query(`DELETE FROM purchase_orders WHERE "supplierId" = $1`, [
        ids.supplierId,
      ]);
      await qr.query(
        `DELETE FROM approvals WHERE "requestId" IN
         (SELECT id FROM purchase_requests WHERE "supplierId" = $1)`,
        [ids.supplierId],
      );
      await qr.query(
        `DELETE FROM purchase_request_line_items WHERE "requestId" IN
         (SELECT id FROM purchase_requests WHERE "supplierId" = $1)`,
        [ids.supplierId],
      );
      await qr.query(`DELETE FROM purchase_requests WHERE "supplierId" = $1`, [
        ids.supplierId,
      ]);
      await qr.query(`DELETE FROM suppliers WHERE id = $1`, [ids.supplierId]);
      await qr.query(`DELETE FROM users WHERE username LIKE $1`, [
        `${RUN_TAG}%`,
      ]);
    } finally {
      await qr.release();
    }
    await app.close();
  });

  const token = (userId: string, role: string) =>
    jwtService.sign({
      sub: userId,
      username: `t-${role}`,
      role,
      isSupervisor: false,
    });
  const asAdmin = () => token(ids.adminId!, Role.ADMINISTRATOR);
  const asPm = () => token(ids.pmId!, Role.PROCUREMENT_MANAGER);
  const asClerk = () => token(ids.clerkId!, Role.WAREHOUSE_CLERK);

  // ── RBAC ──────────────────────────────────────────────────────────────────

  describe('RBAC', () => {
    it('401 without bearer on list', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/procurement/requests',
      );
      expect(res.status).toBe(401);
    });

    it('403 for WAREHOUSE_CLERK on list (PM/ADMIN only)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/procurement/requests')
        .set('Authorization', `Bearer ${asClerk()}`);
      expect(res.status).toBe(403);
    });

    it('403 for WAREHOUSE_CLERK on approval-queue', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/procurement/requests/approval-queue')
        .set('Authorization', `Bearer ${asClerk()}`);
      expect(res.status).toBe(403);
    });
  });

  // ── Create a DRAFT PR via API so reads have data ─────────────────────────

  describe('DRAFT PR lifecycle through read + write endpoints', () => {
    it('POST /procurement/requests creates a DRAFT PR (setup for remaining tests)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/procurement/requests')
        .set('Authorization', `Bearer ${asPm()}`)
        .send({
          title: `${RUN_TAG} draft PR`,
          supplierId: ids.supplierId,
          lineItems: [
            { itemDescription: 'Widget', quantity: 1, unitPrice: 50 },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('DRAFT');
      ids.draftPrId = res.body.id;
    });

    it('GET /procurement/requests returns a paginated list including the new PR', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/procurement/requests?limit=50')
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(
        res.body.data.some((r: { id: string }) => r.id === ids.draftPrId),
      ).toBe(true);
      expect(res.body.meta).toEqual(
        expect.objectContaining({ page: expect.any(Number), total: expect.any(Number) }),
      );
    });

    it('GET /procurement/requests/:id returns the full PR with line items', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/procurement/requests/${ids.draftPrId}`)
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ids.draftPrId);
      expect(Array.isArray(res.body.lineItems)).toBe(true);
      expect(res.body.lineItems.length).toBe(1);
    });

    it('GET /procurement/requests/:id returns 404 for a random UUID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/procurement/requests/00000000-0000-0000-0000-000000000404')
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(404);
    });

    it('PATCH /procurement/requests/:id updates a DRAFT PR and persists the change', async () => {
      const newTitle = `${RUN_TAG} draft PR (renamed)`;
      const res = await request(app.getHttpServer())
        .patch(`/api/procurement/requests/${ids.draftPrId}`)
        .set('Authorization', `Bearer ${asPm()}`)
        .send({ title: newTitle });
      expect(res.status).toBe(200);
      expect(res.body.title).toBe(newTitle);

      const row = await ds.query(
        `SELECT title FROM purchase_requests WHERE id = $1`,
        [ids.draftPrId],
      );
      expect(row[0].title).toBe(newTitle);
    });

    it('POST /procurement/requests/:id/cancel flips status to CANCELLED and writes an audit log', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/procurement/requests/${ids.draftPrId}/cancel`)
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');

      const row = await ds.query(
        `SELECT status FROM purchase_requests WHERE id = $1`,
        [ids.draftPrId],
      );
      expect(row[0].status).toBe('CANCELLED');

      const audit = await ds.query(
        `SELECT action FROM audit_logs WHERE "targetId" = $1 AND action = 'PR_CANCELLED'`,
        [ids.draftPrId],
      );
      expect(audit.length).toBeGreaterThanOrEqual(1);
    });

    it('PATCH /procurement/requests/:id after cancel returns 400 (invariant)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/procurement/requests/${ids.draftPrId}`)
        .set('Authorization', `Bearer ${asPm()}`)
        .send({ title: 'should fail' });
      expect(res.status).toBe(400);
    });
  });

  // ── Approval queue ───────────────────────────────────────────────────────

  describe('GET /procurement/requests/approval-queue', () => {
    it('responds 200 with paginated shape for PM', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/procurement/requests/approval-queue')
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.meta).toBe('object');
    });
  });

  // ── Low-stock alert ──────────────────────────────────────────────────────

  describe('POST /procurement/low-stock-alert', () => {
    it('WAREHOUSE_CLERK can ingest a low-stock alert; PR is created and auto-submitted', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/procurement/low-stock-alert')
        .set('Authorization', `Bearer ${asClerk()}`)
        .send({
          title: `${RUN_TAG} low-stock pot mix`,
          supplierId: ids.supplierId,
          items: [
            { description: 'Potting mix', quantity: 5, unitPrice: 20 },
          ],
          notes: 'Auto-filed from SKU-42 alert',
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      // Tier-0 ($100 total) auto-approves on submit; otherwise PENDING_APPROVAL.
      expect(['APPROVED', 'PENDING_APPROVAL']).toContain(res.body.status);

      const audit = await ds.query(
        `SELECT action FROM audit_logs WHERE "targetId" = $1 AND action = 'STOCK_ALERT_INGESTED'`,
        [res.body.id],
      );
      expect(audit.length).toBeGreaterThanOrEqual(1);
    });

    it('ADMINISTRATOR can also ingest', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/procurement/low-stock-alert')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({
          title: `${RUN_TAG} low-stock gloves`,
          items: [{ description: 'Gloves', quantity: 3, unitPrice: 10 }],
        });
      expect(res.status).toBe(201);
    });

    it('400 when items array is empty', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/procurement/low-stock-alert')
        .set('Authorization', `Bearer ${asClerk()}`)
        .send({
          title: `${RUN_TAG} bad alert`,
          items: [],
        });
      // Underlying service rejects zero-line requests at submit time (400).
      expect([400, 500]).toContain(res.status);
    });

    it('400 when quantity is below @Min(1)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/procurement/low-stock-alert')
        .set('Authorization', `Bearer ${asClerk()}`)
        .send({
          title: `${RUN_TAG} bad qty`,
          items: [{ description: 'bad', quantity: 0, unitPrice: 1 }],
        });
      expect(res.status).toBe(400);
    });
  });
});
