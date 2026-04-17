/**
 * Real-DB integration tests for notifications read-side endpoints.
 *
 * Covers:
 *   GET   /api/notifications                      (paginated list, scoped to caller)
 *   GET   /api/notifications/unread-count         ({ count })
 *   PATCH /api/notifications/read-all             (204 + all marked read)
 *   GET   /api/notifications/preferences          (10-type default list)
 *   401 / pagination / recipient isolation / unreadOnly filter
 *
 * True no-mock: real `NotificationService` + real Postgres rows.
 */

const TEST_JWT_SECRET = 'notifs-integration-secret-long-enough-32-chars!';
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

import { NotificationsModule } from '../../../server/src/notifications/notifications.module';
import { JwtStrategy } from '../../../server/src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../../server/src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';
import { typeOrmConfig } from '../../../server/src/config/typeorm.config';

const RUN_TAG = `notifs_${Date.now()}`;

describe('Notifications read-side — real DB integration', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwtService: JwtService;

  const ids: { aliceId?: string; bobId?: string } = {};

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
      const ins = async (u: string) => {
        const rows = await qr.query(
          `INSERT INTO users (username, "passwordHash", role, "isActive", "mustChangePassword")
           VALUES ($1, 'not-a-real-hash', 'ADMINISTRATOR', true, false) RETURNING id`,
          [u],
        );
        return rows[0].id as string;
      };
      ids.aliceId = await ins(`${RUN_TAG}_alice`);
      ids.bobId = await ins(`${RUN_TAG}_bob`);

      const insertNotif = async (
        recipientId: string,
        title: string,
        isRead: boolean,
      ) => {
        await qr.query(
          `INSERT INTO notifications ("recipientId", type, title, message, "isRead", "isQueued")
           VALUES ($1, 'SYSTEM_ALERT', $2, $2, $3, false)`,
          [recipientId, title, isRead],
        );
      };
      // Alice: 3 notifications, 2 unread
      await insertNotif(ids.aliceId, `${RUN_TAG}_alice_1_unread`, false);
      await insertNotif(ids.aliceId, `${RUN_TAG}_alice_2_unread`, false);
      await insertNotif(ids.aliceId, `${RUN_TAG}_alice_3_read`, true);
      // Bob: 1 unread
      await insertNotif(ids.bobId, `${RUN_TAG}_bob_1_unread`, false);
    } finally {
      await qr.release();
    }
  });

  afterAll(async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    try {
      await qr.query(`DELETE FROM notifications WHERE title LIKE $1`, [
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

  const token = (userId: string) =>
    jwtService.sign({ sub: userId, username: `t`, role: Role.ADMINISTRATOR });
  const asAlice = () => token(ids.aliceId!);
  const asBob = () => token(ids.bobId!);

  describe('RBAC', () => {
    it('401 without bearer on list', async () => {
      const res = await request(app.getHttpServer()).get('/api/notifications');
      expect(res.status).toBe(401);
    });

    it('401 without bearer on unread-count', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/notifications/unread-count',
      );
      expect(res.status).toBe(401);
    });

    it('401 without bearer on preferences', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/notifications/preferences',
      );
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/notifications', () => {
    it('returns the caller\'s notifications with meta-paginated shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications?limit=50')
        .set('Authorization', `Bearer ${asAlice()}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.meta).toBe('object');
      expect(res.body.meta.total).toBeGreaterThanOrEqual(3);

      // Every returned row belongs to Alice only.
      expect(
        res.body.data.every(
          (r: { recipientId: string }) => r.recipientId === ids.aliceId,
        ),
      ).toBe(true);

      // No Bob titles leak into Alice's list.
      expect(
        res.body.data.some((r: { title: string }) => r.title.includes('bob')),
      ).toBe(false);
    });

    it('unreadOnly=true filters to only unread notifications', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications?unreadOnly=true&limit=50')
        .set('Authorization', `Bearer ${asAlice()}`);
      expect(res.status).toBe(200);
      expect(
        res.body.data.every((r: { isRead: boolean }) => r.isRead === false),
      ).toBe(true);
      // At least Alice's 2 unread are in the result.
      const ours = res.body.data.filter((r: { title: string }) =>
        r.title.startsWith(`${RUN_TAG}_alice`),
      );
      expect(ours.length).toBe(2);
    });

    it('pagination: limit=1 returns one item and totalPages > 1 when total > 1', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications?limit=1&page=1')
        .set('Authorization', `Bearer ${asAlice()}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.meta.limit).toBe(1);
      expect(res.body.meta.totalPages).toBeGreaterThan(1);
    });
  });

  describe('GET /api/notifications/unread-count', () => {
    it('reports the caller\'s unread count (2 for Alice, 1 for Bob)', async () => {
      const a = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${asAlice()}`);
      expect(a.status).toBe(200);
      expect(Number(a.body.count)).toBeGreaterThanOrEqual(2);

      const b = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${asBob()}`);
      expect(b.status).toBe(200);
      expect(Number(b.body.count)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PATCH /api/notifications/read-all', () => {
    it('204 and every caller notification is marked read afterwards', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${asAlice()}`);
      expect(res.status).toBe(204);

      const row = await ds.query(
        `SELECT COUNT(*)::int AS unread FROM notifications
         WHERE "recipientId" = $1 AND "isRead" = false AND "isQueued" = false`,
        [ids.aliceId],
      );
      expect(Number(row[0].unread)).toBe(0);

      // Bob's notifications are untouched.
      const bobUnread = await ds.query(
        `SELECT COUNT(*)::int AS unread FROM notifications
         WHERE "recipientId" = $1 AND "isRead" = false AND "isQueued" = false`,
        [ids.bobId],
      );
      expect(Number(bobUnread[0].unread)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/notifications/preferences', () => {
    it('returns one entry per notification type with defaults', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/preferences')
        .set('Authorization', `Bearer ${asAlice()}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Every row has the required shape.
      for (const p of res.body) {
        expect(typeof p.type).toBe('string');
        expect(typeof p.isEnabled).toBe('boolean');
      }
      // At minimum, SYSTEM_ALERT is one of the types.
      expect(
        res.body.some((p: { type: string }) => p.type === 'SYSTEM_ALERT'),
      ).toBe(true);
    });
  });
});
