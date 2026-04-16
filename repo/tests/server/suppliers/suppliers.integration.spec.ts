/**
 * Real-DB integration tests for the Suppliers HTTP layer.
 *
 * Covers:
 *   - CRUD through real Postgres
 *   - RBAC (WAREHOUSE_CLERK / SUPPLIER blocked, PM / ADMIN allowed)
 *   - Sensitive-field stripping: PROCUREMENT_MANAGER must NOT see
 *     bankingNotes / internalRiskFlag / budgetCap; ADMINISTRATOR must see them
 *   - Encrypted column round-trip (bankingNotes persists and decrypts)
 *   - DTO validation (invalid email, wrong paymentTerms enum, UUID pipe)
 */

const TEST_JWT_SECRET = 'suppliers-integration-secret-long-enough-32!';
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

import { SuppliersController } from '../../../server/src/suppliers/suppliers.controller';
import { SuppliersService } from '../../../server/src/suppliers/suppliers.service';
import { Supplier } from '../../../server/src/suppliers/supplier.entity';
import { DataQualityModule } from '../../../server/src/data-quality/data-quality.module';
import { User } from '../../../server/src/users/user.entity';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';
import { typeOrmConfig } from '../../../server/src/config/typeorm.config';

const RUN_TAG = `supint_${Date.now()}`;

describe('Suppliers — real DB integration', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  const ids: {
    adminId?: string;
    pmId?: string;
    clerkId?: string;
    createdSupplierId?: string;
  } = {};

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...typeOrmConfig, migrationsRun: true }),
        TypeOrmModule.forFeature([Supplier, User]),
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
        DataQualityModule,
      ],
      controllers: [SuppliersController],
      providers: [
        SuppliersService,
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
    } finally {
      await qr.release();
    }
  });

  afterAll(async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
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
      const res = await request(app.getHttpServer()).get('/api/suppliers');
      expect(res.status).toBe(401);
    });

    it('403 for WAREHOUSE_CLERK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/suppliers')
        .set('Authorization', `Bearer ${asClerk()}`);
      expect(res.status).toBe(403);
    });
  });

  // ── Create ────────────────────────────────────────────────────────────────

  describe('POST /suppliers', () => {
    it('creates a supplier and returns the row, including encrypted fields for admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({
          name: `${RUN_TAG}_acme`,
          email: 'acme@example.com',
          paymentTerms: 'NET_30',
          bankingNotes: 'ACH routing 12345',
          internalRiskFlag: 'low',
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe(`${RUN_TAG}_acme`);
      // Admin response DOES expose sensitive fields
      expect(res.body.bankingNotes).toBe('ACH routing 12345');
      expect(res.body.internalRiskFlag).toBe('low');
      ids.createdSupplierId = res.body.id;

      // Encrypted columns at rest are NOT plaintext
      const raw = await ds.query(
        `SELECT "bankingNotes" FROM suppliers WHERE id = $1`,
        [ids.createdSupplierId],
      );
      expect(raw[0].bankingNotes).not.toBe('ACH routing 12345');
      expect(typeof raw[0].bankingNotes).toBe('string');
    });

    it('400 when email is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ name: `${RUN_TAG}_bad`, email: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    it('400 when paymentTerms is not a valid enum value', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ name: `${RUN_TAG}_bad2`, paymentTerms: 'NET_9999' });
      expect(res.status).toBe(400);
    });
  });

  // ── Read & sensitive-field stripping ─────────────────────────────────────

  describe('GET /suppliers/:id', () => {
    it('PROCUREMENT_MANAGER does NOT see bankingNotes / internalRiskFlag / budgetCap', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/suppliers/${ids.createdSupplierId}`)
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ids.createdSupplierId);
      expect(res.body).not.toHaveProperty('bankingNotes');
      expect(res.body).not.toHaveProperty('internalRiskFlag');
      expect(res.body).not.toHaveProperty('budgetCap');
    });

    it('ADMINISTRATOR does see bankingNotes and internalRiskFlag', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/suppliers/${ids.createdSupplierId}`)
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(200);
      expect(res.body.bankingNotes).toBe('ACH routing 12345');
      expect(res.body.internalRiskFlag).toBe('low');
    });

    it('400 when id path param is not a UUID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/suppliers/not-a-uuid')
        .set('Authorization', `Bearer ${asAdmin()}`);
      expect(res.status).toBe(400);
    });
  });

  // ── Update ────────────────────────────────────────────────────────────────

  describe('PATCH /suppliers/:id', () => {
    it('ADMIN can set budgetCap, and it persists', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/suppliers/${ids.createdSupplierId}`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ budgetCap: 50000 });
      expect(res.status).toBe(200);
      expect(Number(res.body.budgetCap)).toBe(50000);

      const row = await ds.query(
        `SELECT "budgetCap" FROM suppliers WHERE id = $1`,
        [ids.createdSupplierId],
      );
      expect(Number(row[0].budgetCap)).toBe(50000);
    });

    it('PM update response still strips sensitive fields', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/suppliers/${ids.createdSupplierId}`)
        .set('Authorization', `Bearer ${asPm()}`)
        .send({ phone: '+1-555-0100' });
      expect(res.status).toBe(200);
      expect(res.body.phone).toBe('+1-555-0100');
      expect(res.body).not.toHaveProperty('bankingNotes');
      expect(res.body).not.toHaveProperty('budgetCap');
    });
  });

  // ── List & dropdown ──────────────────────────────────────────────────────

  describe('GET /suppliers', () => {
    it('lists suppliers with sensitive fields stripped for PM', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/suppliers?search=${RUN_TAG}`)
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      for (const s of res.body.data) {
        expect(s).not.toHaveProperty('bankingNotes');
        expect(s).not.toHaveProperty('internalRiskFlag');
        expect(s).not.toHaveProperty('budgetCap');
      }
    });

    it('GET /suppliers/dropdown returns a compact list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/suppliers/dropdown')
        .set('Authorization', `Bearer ${asPm()}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
