/**
 * Purchase-orders edge cases and supplier-portal isolation.
 *
 * Complements `purchase-orders.integration.spec.ts` with:
 *   - DTO validation edges (forbidNonWhitelisted, type coercion)
 *   - Listing filters: status and supplierId query
 *   - Supplier portal: the signed-in supplier user can only see POs for
 *     their linked supplierId and gets 404 for any other PO.
 */

const TEST_JWT_SECRET = 'po-edges-secret-long-enough-32-chars-pls!';
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
import { SupplierPortalPoController } from '../../../server/src/purchase-orders/supplier-portal-po.controller';
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

const PO_PREFIX = `E${Date.now().toString().slice(-9)}`;
const RUN_TAG = `poedge_${Date.now()}`;

describe('Purchase Orders — edges + supplier-portal isolation', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  const ids: {
    adminId?: string;
    supplierAUserId?: string;
    supplierBUserId?: string;
    supplierAId?: string;
    supplierBId?: string;
    poASupplierA?: string;
    poBSupplierB?: string;
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
      controllers: [PurchaseOrdersController, SupplierPortalPoController],
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

      const insertUser = async (u: string, r: string, supplierId?: string) => {
        const rows = await qr.query(
          `INSERT INTO users (username, "passwordHash", role, "isActive", "mustChangePassword", "supplierId")
           VALUES ($1, 'not-a-real-hash', $2, true, false, $3) RETURNING id`,
          [u, r, supplierId ?? null],
        );
        return rows[0].id as string;
      };
      ids.adminId = await insertUser(`${RUN_TAG}_admin`, Role.ADMINISTRATOR);
      ids.supplierAUserId = await insertUser(
        `${RUN_TAG}_supAuser`,
        Role.SUPPLIER,
        ids.supplierAId,
      );
      ids.supplierBUserId = await insertUser(
        `${RUN_TAG}_supBuser`,
        Role.SUPPLIER,
        ids.supplierBId,
      );

      const insertPo = async (
        supplierId: string,
        idx: number,
        status: PoStatus,
      ) => {
        const rows = await qr.query(
          `INSERT INTO purchase_orders
            ("poNumber", "supplierId", "totalAmount", status)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [`${PO_PREFIX}-${idx}`, supplierId, 100, status],
        );
        return rows[0].id as string;
      };
      ids.poASupplierA = await insertPo(ids.supplierAId!, 1, PoStatus.ISSUED);
      ids.poBSupplierB = await insertPo(ids.supplierBId!, 2, PoStatus.ISSUED);
    } finally {
      await qr.release();
    }
  });

  afterAll(async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      await qr.query(`DELETE FROM purchase_orders WHERE "poNumber" LIKE $1`, [
        `${PO_PREFIX}%`,
      ]);
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
  const asAdmin = () => token(ids.adminId!, Role.ADMINISTRATOR);
  const asSupplierA = () => token(ids.supplierAUserId!, Role.SUPPLIER);
  const asSupplierB = () => token(ids.supplierBUserId!, Role.SUPPLIER);

  // ── DTO / validation ──────────────────────────────────────────────────────

  describe('DTO validation edges', () => {
    it('400 when UpdatePoDto receives a forbidden field (whitelist)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/purchase-orders/${ids.poASupplierA}`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ status: 'CLOSED' });
      expect(res.status).toBe(400);
    });

    it('400 when issue DTO receives a forbidden field', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/purchase-orders/${ids.poASupplierA}/issue`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ malicious: true });
      expect(res.status).toBe(400);
    });
  });

  // ── List filters ──────────────────────────────────────────────────────────

  describe('GET /purchase-orders filters', () => {
    it('filters by supplierId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/purchase-orders?supplierId=${ids.supplierAId}`)
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(200);
      for (const p of res.body.data) {
        expect(p.supplierId).toBe(ids.supplierAId);
      }
    });

    it('filters by status=ISSUED', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/purchase-orders?status=ISSUED&limit=100')
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every((p: { status: string }) => p.status === 'ISSUED')).toBe(
        true,
      );
    });
  });

  // ── Supplier portal isolation ────────────────────────────────────────────

  describe('Supplier portal isolation', () => {
    it('supplier A sees only their own POs via the portal', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/supplier-portal/purchase-orders')
        .set('Authorization', `Bearer ${asSupplierA()}`);
      expect(res.status).toBe(200);
      for (const p of res.body.data) {
        expect(p.supplierId).toBe(ids.supplierAId);
      }
    });

    it('supplier A cannot load supplier B\'s PO (404 on cross-supplier id)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/supplier-portal/purchase-orders/${ids.poBSupplierB}`)
        .set('Authorization', `Bearer ${asSupplierA()}`);
      expect(res.status).toBe(404);
    });

    it('supplier B can load their own PO successfully', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/supplier-portal/purchase-orders/${ids.poBSupplierB}`)
        .set('Authorization', `Bearer ${asSupplierB()}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ids.poBSupplierB);
    });

    it('non-SUPPLIER role (ADMIN) is 403 on the supplier portal', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/supplier-portal/purchase-orders')
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(403);
    });
  });
});
