/**
 * Tests for route-level authorization guards.
 *
 * These tests verify that the RolesGuard enforces access control correctly,
 * ensuring:
 *  - Routes with no role requirement are accessible to all authenticated users
 *  - Routes requiring a specific role are blocked for users with other roles
 *  - Unauthenticated (no user) requests are blocked
 */

import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../../server/src/common/guards/roles.guard';
import { Role } from '../../../server/src/common/enums/role.enum';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContext(user: { id: string; role: string } | null): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;
}

// ── RolesGuard ────────────────────────────────────────────────────────────────

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as Reflector;
    guard = new RolesGuard(reflector);
  });

  it('allows access when no roles are required (open route)', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    const ctx = makeContext({ id: 'u1', role: Role.WAREHOUSE_CLERK });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows access when user has the required role', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.ADMINISTRATOR]);
    const ctx = makeContext({ id: 'u1', role: Role.ADMINISTRATOR });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows access when user has one of multiple allowed roles', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
      Role.ADMINISTRATOR,
      Role.PROCUREMENT_MANAGER,
    ]);
    const ctx = makeContext({ id: 'u1', role: Role.PROCUREMENT_MANAGER });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies access when user lacks required role', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.ADMINISTRATOR]);
    const ctx = makeContext({ id: 'u1', role: Role.WAREHOUSE_CLERK });
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('denies access when no user is present in request', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.ADMINISTRATOR]);
    const ctx = makeContext(null);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  // ── Object-level authorization (supplier portal isolation) ────────────────

  describe('SUPPLIER role — portal route access', () => {
    it('SUPPLIER role passes route-level guard for supplier-accessible routes', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Role.SUPPLIER,
        Role.ADMINISTRATOR,
      ]);
      const ctx = makeContext({ id: 'u1', role: Role.SUPPLIER });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('WAREHOUSE_CLERK is denied access to supplier-only routes', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Role.SUPPLIER,
        Role.ADMINISTRATOR,
      ]);
      const ctx = makeContext({ id: 'u1', role: Role.WAREHOUSE_CLERK });
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('PROCUREMENT_MANAGER is denied access to supplier-only routes', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Role.SUPPLIER,
        Role.ADMINISTRATOR,
      ]);
      const ctx = makeContext({ id: 'u1', role: Role.PROCUREMENT_MANAGER });
      expect(guard.canActivate(ctx)).toBe(false);
    });
  });

  // ── Knowledge-base article authoring ─────────────────────────────────────

  describe('Article authoring — ADMINISTRATOR only', () => {
    const ARTICLE_AUTHOR_ROLES = [Role.ADMINISTRATOR];

    it('permits ADMINISTRATOR to create/edit articles', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(ARTICLE_AUTHOR_ROLES);
      const ctx = makeContext({ id: 'u1', role: Role.ADMINISTRATOR });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('denies PLANT_CARE_SPECIALIST from creating articles', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(ARTICLE_AUTHOR_ROLES);
      const ctx = makeContext({ id: 'u1', role: Role.PLANT_CARE_SPECIALIST });
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('denies WAREHOUSE_CLERK from creating articles', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(ARTICLE_AUTHOR_ROLES);
      const ctx = makeContext({ id: 'u1', role: Role.WAREHOUSE_CLERK });
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('denies PROCUREMENT_MANAGER from creating articles', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(ARTICLE_AUTHOR_ROLES);
      const ctx = makeContext({ id: 'u1', role: Role.PROCUREMENT_MANAGER });
      expect(guard.canActivate(ctx)).toBe(false);
    });
  });

  // ── Receiving routes ──────────────────────────────────────────────────────

  describe('Receiving routes — WAREHOUSE_CLERK and ADMINISTRATOR', () => {
    const RECEIVING_ROLES = [Role.WAREHOUSE_CLERK, Role.ADMINISTRATOR];

    it('permits WAREHOUSE_CLERK', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(RECEIVING_ROLES);
      expect(guard.canActivate(makeContext({ id: 'u1', role: Role.WAREHOUSE_CLERK }))).toBe(true);
    });

    it('permits ADMINISTRATOR', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(RECEIVING_ROLES);
      expect(guard.canActivate(makeContext({ id: 'u1', role: Role.ADMINISTRATOR }))).toBe(true);
    });

    it('denies PROCUREMENT_MANAGER from creating receipts', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(RECEIVING_ROLES);
      expect(guard.canActivate(makeContext({ id: 'u1', role: Role.PROCUREMENT_MANAGER }))).toBe(false);
    });

    it('denies unauthenticated request from creating receipts', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(RECEIVING_ROLES);
      expect(guard.canActivate(makeContext(null))).toBe(false);
    });
  });
});
