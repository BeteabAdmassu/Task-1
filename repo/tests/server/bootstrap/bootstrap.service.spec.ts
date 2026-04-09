/**
 * Unit tests for BootstrapService.
 *
 * Security rule: bootstrap admin creation runs ONLY when total user count is 0.
 * When any users already exist the service must skip and log accordingly.
 */

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BootstrapService } from '../../../server/src/bootstrap/bootstrap.service';
import { User } from '../../../server/src/users/user.entity';

const mockUserRepo = {
  count: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

async function buildService() {
  const module = await Test.createTestingModule({
    providers: [
      BootstrapService,
      { provide: getRepositoryToken(User), useValue: mockUserRepo },
    ],
  }).compile();
  return module.get<BootstrapService>(BootstrapService);
}

describe('BootstrapService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear any bootstrap env vars set by previous tests
    delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
    delete process.env.ADMIN_BOOTSTRAP_USERNAME;
  });

  // ── Skip when users already exist ──────────────────────────────────────────

  describe('when users already exist (count > 0)', () => {
    beforeEach(() => {
      mockUserRepo.count.mockResolvedValue(3);
    });

    it('does NOT create any user', async () => {
      const service = await buildService();
      await service.onApplicationBootstrap();
      expect(mockUserRepo.save).not.toHaveBeenCalled();
    });

    it('does not attempt to create admin even when password env var is set', async () => {
      process.env.ADMIN_BOOTSTRAP_PASSWORD = 'ShouldBeIgnored!99';
      const service = await buildService();
      await service.onApplicationBootstrap();
      expect(mockUserRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── Run when user count is 0 ───────────────────────────────────────────────

  describe('when user count is 0', () => {
    beforeEach(() => {
      mockUserRepo.count.mockResolvedValue(0);
      mockUserRepo.create.mockImplementation((data: Partial<User>) => ({ ...data }));
      mockUserRepo.save.mockImplementation(async (user: Partial<User>) => ({ id: 'generated-id', ...user }));
    });

    it('creates the admin user when ADMIN_BOOTSTRAP_PASSWORD is set', async () => {
      process.env.ADMIN_BOOTSTRAP_PASSWORD = 'SecurePass!123';
      const service = await buildService();
      await service.onApplicationBootstrap();
      expect(mockUserRepo.save).toHaveBeenCalledTimes(1);
    });

    it('uses ADMIN_BOOTSTRAP_USERNAME when provided', async () => {
      process.env.ADMIN_BOOTSTRAP_PASSWORD = 'SecurePass!123';
      process.env.ADMIN_BOOTSTRAP_USERNAME = 'superadmin';
      const service = await buildService();
      await service.onApplicationBootstrap();
      expect(mockUserRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'superadmin' }),
      );
    });

    it('defaults username to "admin" when ADMIN_BOOTSTRAP_USERNAME is not set', async () => {
      process.env.ADMIN_BOOTSTRAP_PASSWORD = 'SecurePass!123';
      const service = await buildService();
      await service.onApplicationBootstrap();
      expect(mockUserRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'admin' }),
      );
    });

    it('stores a bcrypt hash, not the plain-text password', async () => {
      process.env.ADMIN_BOOTSTRAP_PASSWORD = 'SecurePass!123';
      const service = await buildService();
      await service.onApplicationBootstrap();
      const createArg = mockUserRepo.create.mock.calls[0][0] as { passwordHash: string };
      expect(createArg.passwordHash).toBeDefined();
      expect(createArg.passwordHash).not.toBe('SecurePass!123');
      expect(createArg.passwordHash).toMatch(/^\$2[ab]\$/); // bcrypt hash prefix
    });

    it('does NOT create a user when ADMIN_BOOTSTRAP_PASSWORD is missing', async () => {
      const service = await buildService();
      await service.onApplicationBootstrap();
      expect(mockUserRepo.save).not.toHaveBeenCalled();
    });
  });
});
