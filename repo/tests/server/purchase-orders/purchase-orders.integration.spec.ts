/**
 * Real-DB integration tests for the Purchase Orders HTTP layer.
 *
 * Boots Nest against the live Postgres DB with migrations applied. Tests go
 * through supertest → guard → controller → service → DB, and assert rows
 * actually change in `purchase_orders`, `notifications`, and `audit_logs`.
 *
 * Covers:
 *   - 401 / 403 access gating
 *   - GET list + findOne
 *   - PATCH expectedDeliveryDate triggers SCHEDULE_CHANGE notification
 *   - PATCH /cancel sets CANCELLED, writes audit log, emits CANCELLATION
 *   - PATCH /issue transitions DRAFT → ISSUED
 *   - Update on cancelled PO → 400
 *   - Cancel already-cancelled PO → 400
 */

const TEST_JWT_SECRET = 'po-integration-secret-long-enough-32-chars!';
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

import { PurchaseOrdersController } from '../../../server/src/purchase-orders/purchase-orders.controller';
import { PurchaseOrdersService } from '../../../server/src/purchase-orders/purchase-orders.service';
import { PurchaseOrder } from '../../../server/src/purchase-orders/entities/purchase-order.entity';
import { PurchaseOrderLineItem } from '../../../server/src/purchase-orders/entities/purchase-order-line-item.entity';
import { AuditModule } from '../../../server/src/audit/audit.module';
import { BudgetModule } from '../../../server/src/budget/budget.module';
import { NotificationsModule } from '../../../server/src/notifications/notifications.module';
import { User } from '../../../server/src/users/user.entity';
import { Supplier } from '../../../server/src/suppliers/supplier.entity';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';
import { PoStatus } from '../../../server/src/common/enums/po-status.enum';
import { typeOrmConfig } from '../../../server/src/config/typeorm.config';

const RUN_TAG = `point_${Date.now()}`;
// poNumber column is varchar(20). Keep PO numbers short by using only the
// low-order digits of the timestamp.
const PO_PREFIX = `T${Date.now().toString().slice(-8)}`;

describe('Purchase Orders — real DB integration', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  const ids: {
    adminId?: string;
    pmId?: string;
    supplierId?: string;
    supplierUserId?: string;
    draftPoId?: string;
    issuedPoId?: string;
    cancelledPoId?: string;
  } = {};

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...typeOrmConfig, migrationsRun: true }),
        TypeOrmModule.forFeature([
          PurchaseOrder,
          PurchaseOrderLineItem,
          User,
          Supplier,
        ]),
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
        AuditModule,
        BudgetModule,
        NotificationsModule,
      ],
      controllers: [PurchaseOrdersController],
      providers: [
        PurchaseOrdersService,
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
      const insertUser = async (username: string, role: string) => {
        const rows = await qr.query(
          `INSERT INTO users (username, "passwordHash", role, "isActive", "mustChangePassword")
           VALUES ($1, 'not-a-real-hash', $2, true, false)
           RETURNING id`,
          [username, role],
        );
        return rows[0].id as string;
      };
      ids.adminId = await insertUser(`${RUN_TAG}_admin`, Role.ADMINISTRATOR);
      ids.pmId = await insertUser(`${RUN_TAG}_pm`, Role.PROCUREMENT_MANAGER);
      ids.supplierUserId = await insertUser(
        `${RUN_TAG}_supplieruser`,
        Role.SUPPLIER,
      );

      const supRows = await qr.query(
        `INSERT INTO suppliers (name, "paymentTerms", "isActive")
         VALUES ($1, 'NET_30', true) RETURNING id`,
        [`${RUN_TAG}_supplier`],
      );
      ids.supplierId = supRows[0].id as string;

      const insertPo = async (status: PoStatus, idx: number) => {
        const rows = await qr.query(
          `INSERT INTO purchase_orders
            ("poNumber", "supplierId", "totalAmount", status, "createdBy")
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [`${PO_PREFIX}-${idx}`, ids.supplierId, 100, status, ids.pmId],
        );
        return rows[0].id as string;
      };
      ids.draftPoId = await insertPo(PoStatus.DRAFT, 1);
      ids.issuedPoId = await insertPo(PoStatus.ISSUED, 2);
      ids.cancelledPoId = await insertPo(PoStatus.CANCELLED, 3);

      // A single line item on the draft PO so issue() has something to find.
      await qr.query(
        `INSERT INTO purchase_order_line_items
          ("poId", description, quantity, "unitPrice", "totalPrice")
         VALUES ($1, $2, 1, 100, 100)`,
        [ids.draftPoId, `${RUN_TAG}-line`],
      );
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
  const asSupplier = () => token(ids.supplierUserId!, Role.SUPPLIER);

  // ── Access control ────────────────────────────────────────────────────────

  describe('Authentication and RBAC', () => {
    it('401 without bearer', async () => {
      const res = await request(app.getHttpServer()).get('/api/purchase-orders');
      expect(res.status).toBe(401);
    });

    it('403 when a SUPPLIER tries to list POs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/purchase-orders')
        .set('Authorization', `Bearer ${asSupplier()}`);
      expect(res.status).toBe(403);
    });
  });

  // ── Read endpoints ───────────────────────────────────────────────────────

  describe('GET purchase-orders', () => {
    it('returns a paginated list to PROCUREMENT_MANAGER', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/purchase-orders')
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      // Our three seeded POs must appear.
      const nums = res.body.data.map((p: { poNumber: string }) => p.poNumber);
      expect(nums).toEqual(
        expect.arrayContaining([
          `${PO_PREFIX}-1`,
          `${PO_PREFIX}-2`,
          `${PO_PREFIX}-3`,
        ]),
      );
    });

    it('returns a specific PO by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/purchase-orders/${ids.draftPoId}`)
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ids.draftPoId);
      expect(res.body.status).toBe(PoStatus.DRAFT);
      expect(res.body.lineItems).toHaveLength(1);
    });

    it('404 for a random UUID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/purchase-orders/00000000-0000-0000-0000-000000000404')
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(404);
    });
  });

  // ── Update & notification side-effect ────────────────────────────────────

  describe('PATCH purchase-orders/:id', () => {
    it('updates expectedDeliveryDate and emits SCHEDULE_CHANGE', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/purchase-orders/${ids.draftPoId}`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ expectedDeliveryDate: '2026-12-31' });
      expect(res.status).toBe(200);
      expect(res.body.expectedDeliveryDate).toBeDefined();

      // The creator (pmId) should receive the SCHEDULE_CHANGE notification.
      const notifs = await ds.query(
        `SELECT type, "referenceId" FROM notifications
         WHERE "recipientId" = $1 AND type = 'SCHEDULE_CHANGE'`,
        [ids.pmId],
      );
      expect(notifs.length).toBeGreaterThanOrEqual(1);
      expect(notifs.some((n: { referenceId: string }) => n.referenceId === ids.draftPoId)).toBe(true);
    });

    it('400 when attempting to update a cancelled PO', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/purchase-orders/${ids.cancelledPoId}`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ notes: 'post-cancel notes' });
      expect(res.status).toBe(400);
    });
  });

  // ── Cancel flow ──────────────────────────────────────────────────────────

  describe('PATCH purchase-orders/:id/cancel', () => {
    it('cancels a DRAFT/ISSUED PO, writes audit, emits CANCELLATION', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/purchase-orders/${ids.issuedPoId}/cancel`)
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(PoStatus.CANCELLED);

      const dbRow = await ds.query(
        `SELECT status FROM purchase_orders WHERE id = $1`,
        [ids.issuedPoId],
      );
      expect(dbRow[0].status).toBe(PoStatus.CANCELLED);

      const audit = await ds.query(
        `SELECT action FROM audit_logs WHERE "targetId" = $1 AND action = 'PO_CANCELLED'`,
        [ids.issuedPoId],
      );
      expect(audit.length).toBeGreaterThanOrEqual(1);

      const notif = await ds.query(
        `SELECT type FROM notifications
         WHERE "recipientId" = $1 AND type = 'CANCELLATION' AND "referenceId" = $2`,
        [ids.pmId, ids.issuedPoId],
      );
      expect(notif.length).toBeGreaterThanOrEqual(1);
    });

    it('400 when cancelling an already-cancelled PO', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/purchase-orders/${ids.cancelledPoId}/cancel`)
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(400);
    });
  });

  // ── Issue flow ───────────────────────────────────────────────────────────

  describe('PATCH purchase-orders/:id/issue', () => {
    it('transitions a DRAFT PO to ISSUED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/purchase-orders/${ids.draftPoId}/issue`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(PoStatus.ISSUED);

      const row = await ds.query(
        `SELECT status, "issuedAt" FROM purchase_orders WHERE id = $1`,
        [ids.draftPoId],
      );
      expect(row[0].status).toBe(PoStatus.ISSUED);
      expect(row[0].issuedAt).not.toBeNull();
    });

    it('400 when trying to issue a PO that is not DRAFT', async () => {
      // The draft PO is now ISSUED from the previous test.
      const res = await request(app.getHttpServer())
        .patch(`/api/purchase-orders/${ids.draftPoId}/issue`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });
});
