/**
 * Real-DB integration tests for Funds Ledger endpoints.
 *
 * Boots a real NestJS app against PostgreSQL (migrations applied). Every
 * test hits `supertest(app.getHttpServer())` so the full HTTP → guard →
 * controller → service → DB pipeline executes, and assertions verify rows
 * actually persisted with the correct running balance.
 *
 * Covers:
 *   - 401 for unauthenticated
 *   - 403 for non-ADMIN on mutations
 *   - 403 for WAREHOUSE_CLERK on GET (PROCUREMENT_MANAGER/ADMIN only)
 *   - 200 deposit / adjustment / escrow-hold / escrow-release / payment / refund
 *   - Running balance is correct after a sequence of mixed entries
 *   - 400 validation: missing fields, bad UUIDs, non-positive amounts
 *   - Ledger summary aggregates by type
 */

const TEST_JWT_SECRET = 'funds-ledger-integration-secret-long-enough-32!!';
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

import { FundsLedgerController } from '../../../server/src/funds-ledger/funds-ledger.controller';
import { FundsLedgerService } from '../../../server/src/funds-ledger/funds-ledger.service';
import { FundsLedgerEntry } from '../../../server/src/funds-ledger/entities/funds-ledger-entry.entity';
import { Supplier } from '../../../server/src/suppliers/supplier.entity';
import { User } from '../../../server/src/users/user.entity';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';
import { typeOrmConfig } from '../../../server/src/config/typeorm.config';

const RUN_TAG = `fundsint_${Date.now()}`;

describe('Funds Ledger — real DB integration', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  const ids: {
    supplierId?: string;
    adminId?: string;
    pmId?: string;
    clerkId?: string;
    poId?: string;
    raId?: string;
  } = {};

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...typeOrmConfig, migrationsRun: true }),
        TypeOrmModule.forFeature([FundsLedgerEntry, Supplier, User]),
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [FundsLedgerController],
      providers: [
        FundsLedgerService,
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
      ids.clerkId = await insertUser(`${RUN_TAG}_clerk`, Role.WAREHOUSE_CLERK);

      const sup = await qr.query(
        `INSERT INTO suppliers (name, "paymentTerms", "isActive")
         VALUES ($1, 'NET_30', true) RETURNING id`,
        [`${RUN_TAG}_supplier`],
      );
      ids.supplierId = sup[0].id as string;

      // We fabricate fake PO/RA UUIDs; the ledger endpoints only require the
      // shape (UUID v4) in DTOs, and the service stores them as text references.
      ids.poId = '11111111-1111-4111-a111-111111111111';
      ids.raId = '22222222-2222-4222-a222-222222222222';
    } finally {
      await qr.release();
    }
  });

  afterAll(async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      await qr.query(
        `DELETE FROM funds_ledger_entries WHERE "supplierId" IN
         (SELECT id FROM suppliers WHERE name LIKE $1)`,
        [`${RUN_TAG}%`],
      );
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

  // ── Auth / RBAC ──────────────────────────────────────────────────────────

  describe('Authentication and RBAC', () => {
    it('401 without bearer token', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/suppliers/${ids.supplierId}/ledger`,
      );
      expect(res.status).toBe(401);
    });

    it('403 for WAREHOUSE_CLERK on GET', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/suppliers/${ids.supplierId}/ledger`)
        .set('Authorization', `Bearer ${asClerk()}`);
      expect(res.status).toBe(403);
    });

    it('200 for PROCUREMENT_MANAGER on GET', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/suppliers/${ids.supplierId}/ledger`)
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(200);
    });

    it('403 for PROCUREMENT_MANAGER on deposit (ADMIN only)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/suppliers/${ids.supplierId}/ledger/deposit`)
        .set('Authorization', `Bearer ${asPm()}`)
        .send({ amount: 100 });
      expect(res.status).toBe(403);
    });
  });

  // ── Mutations persist and update balance ─────────────────────────────────

  describe('Deposit / adjustment / escrow / payment / refund', () => {
    it('deposit adds a positive entry and updates the running balance', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/suppliers/${ids.supplierId}/ledger/deposit`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ amount: 1000 });
      expect(res.status).toBe(201);
      expect(Number(res.body.currentBalance)).toBe(1000);
      expect(Number(res.body.totalDeposits)).toBe(1000);

      const rows = await ds.query(
        `SELECT type, amount, "runningBalance" FROM funds_ledger_entries
         WHERE "supplierId" = $1 ORDER BY "createdAt" ASC`,
        [ids.supplierId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe('DEPOSIT');
      expect(Number(rows[0].amount)).toBe(1000);
      expect(Number(rows[0].runningBalance)).toBe(1000);
    });

    it('escrow-hold creates a negative entry reducing balance', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/suppliers/${ids.supplierId}/ledger/escrow-hold`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ amount: 250, poId: ids.poId });
      expect(res.status).toBe(201);
      expect(Number(res.body.currentBalance)).toBe(750);
      expect(Number(res.body.totalEscrowHolds)).toBe(250);
    });

    it('escrow-release creates a positive entry returning balance', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/suppliers/${ids.supplierId}/ledger/escrow-release`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ amount: 100, poId: ids.poId });
      expect(res.status).toBe(201);
      expect(Number(res.body.currentBalance)).toBe(850);
    });

    it('payment reduces balance', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/suppliers/${ids.supplierId}/ledger/payment`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ amount: 300, poId: ids.poId });
      expect(res.status).toBe(201);
      expect(Number(res.body.currentBalance)).toBe(550);
      expect(Number(res.body.totalPayments)).toBe(300);
    });

    it('refund increases balance and references a return authorization', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/suppliers/${ids.supplierId}/ledger/refund`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ amount: 50, raId: ids.raId });
      expect(res.status).toBe(201);
      expect(Number(res.body.currentBalance)).toBe(600);
      expect(Number(res.body.totalRefunds)).toBe(50);

      const ref = await ds.query(
        `SELECT "referenceType", "referenceId" FROM funds_ledger_entries
         WHERE "supplierId" = $1 AND type = 'REFUND'`,
        [ids.supplierId],
      );
      expect(ref[0].referenceType).toBe('RETURN_AUTHORIZATION');
      expect(ref[0].referenceId).toBe(ids.raId);
    });

    it('adjustment accepts a negative amount and persists it', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/suppliers/${ids.supplierId}/ledger/adjustment`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ amount: -25, description: 'bank fee' });
      expect(res.status).toBe(201);
      expect(Number(res.body.currentBalance)).toBe(575);

      const rows = await ds.query(
        `SELECT amount, description FROM funds_ledger_entries
         WHERE "supplierId" = $1 AND type = 'ADJUSTMENT'`,
        [ids.supplierId],
      );
      expect(Number(rows[0].amount)).toBe(-25);
      expect(rows[0].description).toBe('bank fee');
    });
  });

  // ── Ledger listing ────────────────────────────────────────────────────────

  describe('GET ledger', () => {
    it('returns all entries with summary for this supplier only', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/suppliers/${ids.supplierId}/ledger`)
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(6);
      expect(res.body.summary).toBeDefined();
      expect(Number(res.body.summary.currentBalance)).toBe(575);
      // All entries belong to this supplier
      expect(
        res.body.data.every(
          (e: { supplierId: string }) => e.supplierId === ids.supplierId,
        ),
      ).toBe(true);
    });
  });

  // ── Validation ───────────────────────────────────────────────────────────

  describe('DTO validation', () => {
    it('400 when amount is missing', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/suppliers/${ids.supplierId}/ledger/deposit`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('400 when amount is zero/negative on deposit (@Min(0.01))', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/suppliers/${ids.supplierId}/ledger/deposit`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ amount: 0 });
      expect(res.status).toBe(400);
    });

    it('400 when poId is not a UUID on escrow-hold', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/suppliers/${ids.supplierId}/ledger/escrow-hold`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ amount: 100, poId: 'not-a-uuid' });
      expect(res.status).toBe(400);
    });

    it('400 when supplierId path param is not a UUID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/suppliers/not-a-uuid/ledger`)
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(400);
    });
  });
});
