/**
 * Cross-module procurement-flow integration test.
 *
 * End-to-end *server-side* flow (no mocks) that traverses four modules —
 * Procurement, Purchase Orders, Notifications, Audit — through real HTTP
 * requests and asserts every observable side effect actually persists.
 *
 * Flow under test:
 *
 *   1. ADMIN creates a PR below the tier-0 threshold ($200).
 *   2. ADMIN submits the PR → auto-approved → PO auto-generated.
 *   3. ADMIN issues the PO → status becomes ISSUED.
 *   4. ADMIN updates PO delivery date → SCHEDULE_CHANGE notification.
 *   5. ADMIN cancels the PO → CANCELLATION notification + audit.
 *
 * Assertions span multiple tables — this is the scenario that catches
 * regressions where individual modules work in isolation but the
 * interactions between them silently drift.
 */

const TEST_JWT_SECRET = 'cross-module-integration-secret-long-enough-32!';
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
import { PoStatus } from '../../../server/src/common/enums/po-status.enum';
import { typeOrmConfig } from '../../../server/src/config/typeorm.config';

const RUN_TAG = `xmodint_${Date.now()}`;

describe('Cross-module procurement flow — real DB, 4 modules', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  const ids: {
    adminId?: string;
    supplierId?: string;
    prId?: string;
    poId?: string;
  } = {};

  beforeAll(async () => {
    const module = await Test.createTestingModule({
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

    // Seed: one admin user, one active supplier.
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      const adminRow = await qr.query(
        `INSERT INTO users (username, "passwordHash", role, "isActive", "mustChangePassword")
         VALUES ($1, 'not-a-real-hash', 'ADMINISTRATOR', true, false)
         RETURNING id`,
        [`${RUN_TAG}_admin`],
      );
      ids.adminId = adminRow[0].id as string;

      const supRow = await qr.query(
        `INSERT INTO suppliers (name, "paymentTerms", "isActive")
         VALUES ($1, 'NET_30', true) RETURNING id`,
        [`${RUN_TAG}_supplier`],
      );
      ids.supplierId = supRow[0].id as string;
    } finally {
      await qr.release();
    }
  });

  afterAll(async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      // Clean up in FK-safe order. Anything that referenced the admin user
      // or the synthetic supplier we created.
      await qr.query(
        `DELETE FROM notifications WHERE "recipientId" = $1`,
        [ids.adminId],
      );
      await qr.query(
        `DELETE FROM audit_logs WHERE "userId" = $1`,
        [ids.adminId],
      );
      await qr.query(
        `DELETE FROM purchase_order_line_items WHERE "poId" IN
         (SELECT id FROM purchase_orders WHERE "supplierId" = $1)`,
        [ids.supplierId],
      );
      await qr.query(
        `DELETE FROM purchase_orders WHERE "supplierId" = $1`,
        [ids.supplierId],
      );
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
      await qr.query(
        `DELETE FROM purchase_requests WHERE "supplierId" = $1`,
        [ids.supplierId],
      );
      await qr.query(`DELETE FROM suppliers WHERE id = $1`, [ids.supplierId]);
      await qr.query(`DELETE FROM users WHERE id = $1`, [ids.adminId]);
    } finally {
      await qr.release();
    }
    await app.close();
  });

  const adminToken = () =>
    jwtService.sign({
      sub: ids.adminId,
      username: `${RUN_TAG}_admin`,
      role: Role.ADMINISTRATOR,
      isSupervisor: false,
    });

  it('Step 1: POST /procurement/requests creates a DRAFT PR with a PR_CREATED audit log', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/procurement/requests')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        title: `${RUN_TAG} fertilizer order`,
        supplierId: ids.supplierId,
        lineItems: [
          { itemDescription: 'Fertilizer 40lb bag', quantity: 2, unitPrice: 100 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(Number(res.body.totalAmount)).toBe(200);
    ids.prId = res.body.id as string;

    const audit = await ds.query(
      `SELECT action FROM audit_logs WHERE "userId" = $1 AND "targetId" = $2`,
      [ids.adminId, ids.prId],
    );
    expect(audit.some((a: { action: string }) => a.action === 'PR_CREATED')).toBe(true);
  });

  it('Step 2: POST /procurement/requests/:id/submit auto-approves and auto-creates a PO', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/procurement/requests/${ids.prId}/submit`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    // Tier-0 ≤ $500 auto-approves; service also auto-creates a PO.
    expect(res.body.status).toBe('APPROVED');

    // Audit: tier-0 auto-approval logs PR_AUTO_APPROVED (NOT PR_SUBMITTED — the
    // service skips the submitted-state transition for auto-approved requests)
    // plus PO_CREATED for the auto-generated draft PO.
    const audit = await ds.query(
      `SELECT action FROM audit_logs WHERE "userId" = $1`,
      [ids.adminId],
    );
    const actions = new Set(audit.map((a: { action: string }) => a.action));
    expect(actions.has('PR_AUTO_APPROVED')).toBe(true);
    expect(actions.has('PO_CREATED')).toBe(true);

    // Fetch the auto-generated PO via a real HTTP call (cross-module)
    const list = await request(app.getHttpServer())
      .get('/api/purchase-orders')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(list.status).toBe(200);
    const matching = list.body.data.filter(
      (p: { requestId: string }) => p.requestId === ids.prId,
    );
    expect(matching).toHaveLength(1);
    expect(matching[0].status).toBe(PoStatus.DRAFT);
    ids.poId = matching[0].id as string;

    // Notifications: PO creator got a PO_ISSUED notification (title "Purchase Order Created")
    const notifs = await ds.query(
      `SELECT type, title FROM notifications
       WHERE "recipientId" = $1 AND "referenceId" = $2`,
      [ids.adminId, ids.poId],
    );
    expect(
      notifs.some(
        (n: { type: string; title: string }) =>
          n.type === 'PO_ISSUED' && n.title === 'Purchase Order Created',
      ),
    ).toBe(true);
  });

  it('Step 3: PATCH /purchase-orders/:id/issue transitions PO to ISSUED and emits a second PO_ISSUED notification', async () => {
    const before = await ds.query(
      `SELECT COUNT(*)::int AS n FROM notifications
       WHERE "recipientId" = $1 AND type = 'PO_ISSUED' AND "referenceId" = $2`,
      [ids.adminId, ids.poId],
    );

    const res = await request(app.getHttpServer())
      .patch(`/api/purchase-orders/${ids.poId}/issue`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});

    if (res.status !== 200) {
      // eslint-disable-next-line no-console
      console.error('Step 3 response body:', res.status, res.body);
    }
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(PoStatus.ISSUED);
    expect(res.body.issuedAt).not.toBeNull();

    const row = await ds.query(
      `SELECT status, "issuedAt" FROM purchase_orders WHERE id = $1`,
      [ids.poId],
    );
    expect(row[0].status).toBe(PoStatus.ISSUED);
    expect(row[0].issuedAt).not.toBeNull();

    const after = await ds.query(
      `SELECT COUNT(*)::int AS n FROM notifications
       WHERE "recipientId" = $1 AND type = 'PO_ISSUED' AND "referenceId" = $2`,
      [ids.adminId, ids.poId],
    );
    expect(after[0].n).toBe(before[0].n + 1);
  });

  it('Step 4: PATCH /purchase-orders/:id updates delivery date and emits SCHEDULE_CHANGE', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/purchase-orders/${ids.poId}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ expectedDeliveryDate: '2026-12-31' });

    expect(res.status).toBe(200);

    const notifs = await ds.query(
      `SELECT type FROM notifications
       WHERE "recipientId" = $1 AND type = 'SCHEDULE_CHANGE' AND "referenceId" = $2`,
      [ids.adminId, ids.poId],
    );
    expect(notifs.length).toBeGreaterThanOrEqual(1);
  });

  it('Step 5: PATCH /purchase-orders/:id/cancel emits CANCELLATION + PO_CANCELLED audit + status=CANCELLED', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/purchase-orders/${ids.poId}/cancel`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(PoStatus.CANCELLED);

    const row = await ds.query(
      `SELECT status FROM purchase_orders WHERE id = $1`,
      [ids.poId],
    );
    expect(row[0].status).toBe(PoStatus.CANCELLED);

    const audit = await ds.query(
      `SELECT action FROM audit_logs WHERE "targetId" = $1 AND action = 'PO_CANCELLED'`,
      [ids.poId],
    );
    expect(audit.length).toBeGreaterThanOrEqual(1);

    const notifs = await ds.query(
      `SELECT type FROM notifications
       WHERE "recipientId" = $1 AND type = 'CANCELLATION' AND "referenceId" = $2`,
      [ids.adminId, ids.poId],
    );
    expect(notifs.length).toBeGreaterThanOrEqual(1);
  });

  it('Step 6: cancelled PO can no longer be updated or re-cancelled — invariant check', async () => {
    const update = await request(app.getHttpServer())
      .patch(`/api/purchase-orders/${ids.poId}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ notes: 'post-cancel note' });
    expect(update.status).toBe(400);

    const cancel = await request(app.getHttpServer())
      .patch(`/api/purchase-orders/${ids.poId}/cancel`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(cancel.status).toBe(400);
  });
});
