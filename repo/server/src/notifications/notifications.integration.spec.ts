/**
 * Integration tests for the Notifications HTTP layer.
 *
 * Covers:
 *   - PATCH /notifications/:id/read  → 404 when notification is missing/belongs to another user
 *   - PATCH /notifications/:id/read  → 400 on invalid UUID param (ParseUUIDPipe)
 *   - PATCH /notifications/preferences → 400 on invalid body, 200 on valid body
 *   - 401 for unauthenticated requests
 */

const TEST_JWT_SECRET = 'integration-test-secret-long-enough-32-chars!!';
process.env.JWT_SECRET = TEST_JWT_SECRET;

import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';

import { NotificationsController } from './notifications.controller';
import { NotificationService } from './notification.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { NotificationType } from '../common/enums/notification-type.enum';

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const UNKNOWN_UUID = '00000000-0000-0000-0000-000000000099';

describe('NotificationsController — HTTP integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const mockService = {
    findForUser: jest.fn(),
    getUnreadCount: jest.fn(),
    markAllRead: jest.fn(),
    markRead: jest.fn(),
    getPreferences: jest.fn(),
    updatePreferences: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [NotificationsController],
      providers: [
        JwtStrategy,
        { provide: NotificationService, useValue: mockService },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    jwtService = module.get(JwtService);
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  const token = (role: Role = Role.PROCUREMENT_MANAGER) =>
    jwtService.sign({ sub: 'user-1', username: 'pm', role });

  // ── PATCH /notifications/:id/read ────────────────────────────────────────────

  describe('PATCH /api/notifications/:id/read', () => {
    it('returns 404 when the notification does not exist for the requesting user', async () => {
      mockService.markRead.mockRejectedValue(new NotFoundException('Notification not found'));

      const res = await request(app.getHttpServer())
        .patch(`/api/notifications/${UNKNOWN_UUID}/read`)
        .set('Authorization', `Bearer ${token()}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Notification not found');
      // Confirm the service was called with the authenticated user's id
      expect(mockService.markRead).toHaveBeenCalledWith(UNKNOWN_UUID, 'user-1');
    });

    it('returns 200 and the updated notification when found', async () => {
      const now = new Date().toISOString();
      mockService.markRead.mockResolvedValue({ id: VALID_UUID, isRead: true, readAt: now });

      const res = await request(app.getHttpServer())
        .patch(`/api/notifications/${VALID_UUID}/read`)
        .set('Authorization', `Bearer ${token()}`);

      expect(res.status).toBe(200);
      expect(res.body.isRead).toBe(true);
    });

    it('returns 400 when id is not a valid UUID (ParseUUIDPipe)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/notifications/not-a-uuid/read')
        .set('Authorization', `Bearer ${token()}`);

      expect(res.status).toBe(400);
      expect(mockService.markRead).not.toHaveBeenCalled();
    });

    it('returns 401 without a Bearer token', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/notifications/${VALID_UUID}/read`);

      expect(res.status).toBe(401);
    });

    it('SUPPLIER role can mark their own notification read (all roles are allowed)', async () => {
      mockService.markRead.mockResolvedValue({ id: VALID_UUID, isRead: true, readAt: new Date().toISOString() });

      const res = await request(app.getHttpServer())
        .patch(`/api/notifications/${VALID_UUID}/read`)
        .set('Authorization', `Bearer ${token(Role.SUPPLIER)}`);

      expect(res.status).toBe(200);
    });
  });

  // ── PATCH /notifications/preferences ─────────────────────────────────────────

  describe('PATCH /api/notifications/preferences', () => {
    it('returns 400 when preferences is not an array', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/notifications/preferences')
        .set('Authorization', `Bearer ${token()}`)
        .send({ preferences: 'not-an-array' });

      expect(res.status).toBe(400);
      expect(mockService.updatePreferences).not.toHaveBeenCalled();
    });

    it('returns 400 when a preference item has an invalid NotificationType', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/notifications/preferences')
        .set('Authorization', `Bearer ${token()}`)
        .send({ preferences: [{ type: 'INVALID_TYPE', isEnabled: true }] });

      expect(res.status).toBe(400);
    });

    it('returns 400 when isEnabled is not a boolean', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/notifications/preferences')
        .set('Authorization', `Bearer ${token()}`)
        .send({
          preferences: [{ type: NotificationType.REQUEST_APPROVED, isEnabled: 'yes' }],
        });

      expect(res.status).toBe(400);
    });

    it('returns 200 on a valid preferences update', async () => {
      mockService.updatePreferences.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .patch('/api/notifications/preferences')
        .set('Authorization', `Bearer ${token()}`)
        .send({
          preferences: [
            { type: NotificationType.REQUEST_APPROVED, isEnabled: true },
            { type: NotificationType.REQUEST_REJECTED, isEnabled: false },
          ],
        });

      expect(res.status).toBe(200);
      expect(mockService.updatePreferences).toHaveBeenCalledWith(
        'user-1',
        expect.arrayContaining([
          expect.objectContaining({ type: NotificationType.REQUEST_APPROVED, isEnabled: true }),
        ]),
      );
    });

    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/notifications/preferences')
        .send({ preferences: [] });

      expect(res.status).toBe(401);
    });
  });
});
