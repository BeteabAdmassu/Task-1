/**
 * Real-DB integration tests for:
 *   POST /api/auth/logout           (public)
 *   POST /api/auth/change-password  (authenticated)
 *
 * True no-mock: boots the full AuthModule against Postgres, uses real bcrypt
 * hashing in `users.passwordHash`, and asserts state transitions in both the
 * `users` and `sessions` tables — not just HTTP status.
 */

const TEST_JWT_SECRET = 'auth-logout-change-integration-secret-32-chars!';
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.FIELD_ENCRYPTION_KEY =
  process.env.FIELD_ENCRYPTION_KEY ??
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

jest.setTimeout(30_000);

import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { AuthModule } from '../../../server/src/auth/auth.module';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';
import { typeOrmConfig } from '../../../server/src/config/typeorm.config';

const RUN_TAG = `authlc_${Date.now()}`;

describe('Auth — logout + change-password, real DB', () => {
  let app: INestApplication;
  let ds: DataSource;

  function extractRefreshCookie(headers: Record<string, string | string[] | undefined>): string | undefined {
    const raw = headers['set-cookie'];
    if (!raw) return undefined;
    const arr: string[] = Array.isArray(raw) ? (raw as string[]) : [raw as string];
    return arr.find((c) => typeof c === 'string' && c.startsWith('refresh_token='));
  }

  // Acquire a real access token + refresh_token cookie by hitting POST /login.
  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    const refreshCookie = extractRefreshCookie(res.headers);
    expect(refreshCookie).toBeDefined();
    return { accessToken: res.body.accessToken as string, refreshCookie: refreshCookie! };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...typeOrmConfig, migrationsRun: true }),
        AuthModule,
      ],
      providers: [
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

    // Seed a fresh user with a real bcrypt hash so validateUser works.
    const passwordHash = await bcrypt.hash('old-password-123', 10);
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      await qr.query(
        `INSERT INTO users (username, "passwordHash", role, "isActive", "mustChangePassword")
         VALUES ($1, $2, 'ADMINISTRATOR', true, false)`,
        [`${RUN_TAG}_alice`, passwordHash],
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
        `DELETE FROM sessions WHERE "userId" IN
         (SELECT id FROM users WHERE username LIKE $1)`,
        [`${RUN_TAG}%`],
      );
      await qr.query(`DELETE FROM users WHERE username LIKE $1`, [
        `${RUN_TAG}%`,
      ]);
    } finally {
      await qr.release();
    }
    await app.close();
  });

  // ── POST /api/auth/logout ────────────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    it('is @Public — no bearer required, and returns a JSON message', async () => {
      const res = await request(app.getHttpServer()).post('/api/auth/logout');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Logged out' });
    });

    it('clears the refresh_token cookie (browser receives Max-Age=0)', async () => {
      const res = await request(app.getHttpServer()).post('/api/auth/logout');
      const cleared = extractRefreshCookie(res.headers);
      expect(cleared).toBeDefined();
      // Express sends an empty value + Max-Age=0 or an expired date.
      expect(cleared!.toLowerCase()).toMatch(/refresh_token=;|expires=|max-age=0/);
    });

    it('deletes the session row for a valid refresh_token', async () => {
      const { refreshCookie } = await login(`${RUN_TAG}_alice`, 'old-password-123');

      const before = await ds.query(
        `SELECT COUNT(*)::int AS n FROM sessions WHERE "userId" IN
         (SELECT id FROM users WHERE username = $1)`,
        [`${RUN_TAG}_alice`],
      );
      expect(Number(before[0].n)).toBeGreaterThanOrEqual(1);

      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', refreshCookie);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out');

      const rt = refreshCookie.split(';')[0].split('=')[1];
      const row = await ds.query(
        `SELECT COUNT(*)::int AS n FROM sessions WHERE "refreshToken" = $1`,
        [rt],
      );
      expect(Number(row[0].n)).toBe(0);
    });

    it('gracefully no-ops when the cookie is missing (still 200)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', 'unrelated=value');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out');
    });
  });

  // ── POST /api/auth/change-password ───────────────────────────────────────

  describe('POST /api/auth/change-password', () => {
    it('401 without bearer (JwtAuthGuard rejects before body validation)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .send({ currentPassword: 'x', newPassword: 'xxxxxxxx' });
      expect(res.status).toBe(401);
    });

    it('400 when currentPassword is wrong — precise BadRequest message', async () => {
      const { accessToken, refreshCookie } = await login(
        `${RUN_TAG}_alice`,
        'old-password-123',
      );
      const res = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', refreshCookie)
        .send({ currentPassword: 'WRONG', newPassword: 'another-secure-1' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Current password is incorrect/i);
    });

    it('400 when new password duplicates the current one', async () => {
      const { accessToken, refreshCookie } = await login(
        `${RUN_TAG}_alice`,
        'old-password-123',
      );
      const res = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', refreshCookie)
        .send({
          currentPassword: 'old-password-123',
          newPassword: 'old-password-123',
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/differ/i);
    });

    it('400 when newPassword is below @MinLength(8)', async () => {
      const { accessToken, refreshCookie } = await login(
        `${RUN_TAG}_alice`,
        'old-password-123',
      );
      const res = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', refreshCookie)
        .send({ currentPassword: 'old-password-123', newPassword: 'short' });
      expect(res.status).toBe(400);
      const msg = Array.isArray(res.body.message)
        ? res.body.message.join(' ')
        : String(res.body.message);
      expect(msg.toLowerCase()).toContain('newpassword');
    });

    it('200 on success — bcrypt.compare against the stored hash verifies the new password', async () => {
      // Login with current password to get fresh session.
      const { accessToken, refreshCookie } = await login(
        `${RUN_TAG}_alice`,
        'old-password-123',
      );
      // Also log in a SECOND session for the same user. After change-password
      // this other session must be invalidated (AuthService only preserves
      // the CURRENT refresh token).
      const other = await login(`${RUN_TAG}_alice`, 'old-password-123');
      const otherRt = other.refreshCookie.split(';')[0].split('=')[1];

      const res = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', refreshCookie)
        .send({
          currentPassword: 'old-password-123',
          newPassword: 'brand-new-secure-9',
        });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Password changed successfully' });

      // The stored hash matches the NEW password only.
      const row = await ds.query(
        `SELECT "passwordHash", "mustChangePassword" FROM users WHERE username = $1`,
        [`${RUN_TAG}_alice`],
      );
      expect(row[0].mustChangePassword).toBe(false);
      expect(
        await bcrypt.compare('brand-new-secure-9', row[0].passwordHash),
      ).toBe(true);
      expect(await bcrypt.compare('old-password-123', row[0].passwordHash)).toBe(
        false,
      );

      // The OTHER session (not the one that changed the password) must be gone.
      const otherSession = await ds.query(
        `SELECT COUNT(*)::int AS n FROM sessions WHERE "refreshToken" = $1`,
        [otherRt],
      );
      expect(Number(otherSession[0].n)).toBe(0);

      // The CURRENT session survives.
      const currentRt = refreshCookie.split(';')[0].split('=')[1];
      const currentSession = await ds.query(
        `SELECT COUNT(*)::int AS n FROM sessions WHERE "refreshToken" = $1`,
        [currentRt],
      );
      expect(Number(currentSession[0].n)).toBe(1);

      // And now login with the OLD password must fail (credential rotation).
      const oldLogin = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: `${RUN_TAG}_alice`, password: 'old-password-123' });
      expect(oldLogin.status).toBe(401);

      // While login with the NEW password succeeds.
      const newLogin = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: `${RUN_TAG}_alice`, password: 'brand-new-secure-9' });
      expect(newLogin.status).toBe(200);
      expect(newLogin.body.user.username).toBe(`${RUN_TAG}_alice`);
    });
  });
});
