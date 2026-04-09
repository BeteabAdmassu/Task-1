import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Not } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../../server/src/auth/auth.service';
import { Session } from '../../../server/src/auth/session.entity';
import { User } from '../../../server/src/users/user.entity';
import { UsersService } from '../../../server/src/users/users.service';
import { Role } from '../../../server/src/common/enums/role.enum';

const mockUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    username: 'testuser',
    passwordHash: '$2b$12$hashedpw',
    role: Role.PROCUREMENT_MANAGER,
    isActive: true,
    mustChangePassword: false,
    supplierId: null,
    supplier: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User;

const mockSession = (overrides = {}) => ({
  id: 'session-1',
  userId: 'user-1',
  refreshToken: 'tok123',
  expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  lastActivityAt: new Date(),
  user: mockUser(),
  ...overrides,
});

describe('AuthService', () => {
  let service: AuthService;

  const sessionRepo = {
    create: jest.fn((data: Partial<Session>) => data),
    save: jest.fn(async (s: Partial<Session>) => s),
    findOne: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
  };

  const userRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const usersService = {
    findByUsername: jest.fn(),
  };

  const jwtService = {
    sign: jest.fn(() => 'signed.jwt.token'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: getRepositoryToken(Session), useValue: sessionRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  // ── validateUser ────────────────────────────────────────────────────────

  describe('validateUser', () => {
    it('returns user when credentials are valid', async () => {
      const user = mockUser();
      usersService.findByUsername.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      const result = await service.validateUser('testuser', 'password');
      expect(result).toBe(user);
    });

    it('throws 401 when user not found', async () => {
      usersService.findByUsername.mockResolvedValue(null);
      await expect(service.validateUser('unknown', 'pw')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws 401 when user is inactive', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser({ isActive: false }));
      await expect(service.validateUser('testuser', 'pw')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws 401 when password is wrong', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser());
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);
      await expect(service.validateUser('testuser', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── login ──────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns accessToken and user info including mustChangePassword', async () => {
      const user = mockUser({ mustChangePassword: true });
      sessionRepo.save.mockResolvedValue({});

      const result = await service.login(user);

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user.id).toBe('user-1');
      expect(result.user.mustChangePassword).toBe(true);
      expect(sessionRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // ── refresh ────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('returns new access token for valid session', async () => {
      sessionRepo.findOne.mockResolvedValue(mockSession());
      sessionRepo.save.mockResolvedValue({});

      const result = await service.refresh('tok123');

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user.username).toBe('testuser');
      expect(sessionRepo.save).toHaveBeenCalled();
    });

    it('rotates the refresh token — saved session has a different refreshToken', async () => {
      const originalToken = 'tok123';
      sessionRepo.findOne.mockResolvedValue(mockSession({ refreshToken: originalToken }));
      sessionRepo.save.mockResolvedValue({});

      const result = await service.refresh(originalToken);

      // The returned refreshToken must differ from the one passed in
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toBe(originalToken);

      // The session was saved with the new token
      const savedSession = sessionRepo.save.mock.calls[0][0];
      expect(savedSession.refreshToken).toBe(result.refreshToken);
    });

    it('throws 401 for unknown refresh token', async () => {
      sessionRepo.findOne.mockResolvedValue(null);
      await expect(service.refresh('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws 401 and removes session when expired', async () => {
      sessionRepo.findOne.mockResolvedValue(
        mockSession({ expiresAt: new Date(Date.now() - 1000) }),
      );
      sessionRepo.remove.mockResolvedValue({});

      await expect(service.refresh('tok123')).rejects.toThrow(UnauthorizedException);
      expect(sessionRepo.remove).toHaveBeenCalled();
    });

    it('throws 401 when session has been inactive too long', async () => {
      sessionRepo.findOne.mockResolvedValue(
        mockSession({ lastActivityAt: new Date(Date.now() - 40 * 60 * 1000) }),
      );
      sessionRepo.remove.mockResolvedValue({});

      await expect(service.refresh('tok123')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── logout ─────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('deletes the session for the given refresh token', async () => {
      sessionRepo.delete.mockResolvedValue({ affected: 1 });
      await service.logout('tok123');
      expect(sessionRepo.delete).toHaveBeenCalledWith({ refreshToken: 'tok123' });
    });
  });

  // ── changePassword ─────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('updates passwordHash and clears mustChangePassword', async () => {
      const user = mockUser({ mustChangePassword: true });
      userRepo.findOne.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
      jest.spyOn(bcrypt, 'hash').mockImplementation(async () => '$2b$12$newHash');
      userRepo.update.mockResolvedValue({});
      sessionRepo.delete.mockResolvedValue({});

      await service.changePassword('user-1', 'oldPw', 'newPw12345', 'current-refresh-token');

      expect(userRepo.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ mustChangePassword: false }),
      );
    });

    it('deletes other sessions but preserves the current refresh token session', async () => {
      userRepo.findOne.mockResolvedValue(mockUser());
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
      jest.spyOn(bcrypt, 'hash').mockImplementation(async () => '$2b$12$newHash');
      userRepo.update.mockResolvedValue({});
      sessionRepo.delete.mockResolvedValue({});

      await service.changePassword('user-1', 'oldPw', 'newPw12345', 'my-current-token');

      // The delete must exclude the current session's refresh token
      expect(sessionRepo.delete).toHaveBeenCalledWith({
        userId: 'user-1',
        refreshToken: Not('my-current-token'),
      });
    });

    it('throws 400 when current password is wrong', async () => {
      userRepo.findOne.mockResolvedValue(mockUser());
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      await expect(service.changePassword('user-1', 'wrong', 'newPw12345', 'tok')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws 400 when new password equals current', async () => {
      userRepo.findOne.mockResolvedValue(mockUser());
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      await expect(service.changePassword('user-1', 'same', 'same', 'tok')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws 401 when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.changePassword('bad-id', 'pw', 'newpw', 'tok')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
