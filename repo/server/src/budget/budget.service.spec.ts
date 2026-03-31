import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { BudgetService } from './budget.service';
import { BudgetOverride } from './entities/budget-override.entity';
import { Supplier } from '../suppliers/supplier.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../common/enums/audit-action.enum';

// Minimal EntityManager stub re-used across tests
function makeManager(overrides: Record<string, jest.Mock> = {}) {
  return {
    query: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((_, data) => data),
    save: jest.fn(async (_, data) => data),
    ...overrides,
  };
}

describe('BudgetService', () => {
  let service: BudgetService;

  const overrideRepo = {
    save: jest.fn(),
  };

  const supplierRepo = {
    findOne: jest.fn(),
  };

  const dataSource = {
    query: jest.fn(),
  };

  const auditService = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetService,
        { provide: getRepositoryToken(BudgetOverride), useValue: overrideRepo },
        { provide: getRepositoryToken(Supplier), useValue: supplierRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();
    service = module.get(BudgetService);
    jest.clearAllMocks();
  });

  // ── checkAndEnforce ────────────────────────────────────────────────────────

  describe('checkAndEnforce', () => {
    it('returns allowed=true when supplier has no budgetCap', async () => {
      const manager = makeManager({
        findOne: jest.fn().mockResolvedValue({ id: 'sup-1', budgetCap: null }),
      });

      const result = await service.checkAndEnforce(manager as any, 'sup-1', 5000);

      expect(result).toEqual({ allowed: true, cap: null, committed: 0, available: null });
      // Advisory lock must NOT be acquired when there is no cap
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('returns allowed=true when supplier not found (no cap to enforce)', async () => {
      const manager = makeManager({
        findOne: jest.fn().mockResolvedValue(null),
      });

      const result = await service.checkAndEnforce(manager as any, 'missing-sup', 100);

      expect(result.allowed).toBe(true);
    });

    it('returns allowed=true when PO fits within available budget', async () => {
      const manager = makeManager({
        findOne: jest.fn().mockResolvedValue({ id: 'sup-1', budgetCap: 10000 }),
        query: jest.fn()
          .mockResolvedValueOnce([]) // advisory lock
          .mockResolvedValueOnce([{ committed: '3000' }]), // committed query
      });

      const result = await service.checkAndEnforce(manager as any, 'sup-1', 5000);

      expect(result).toEqual({
        allowed: true,
        cap: 10000,
        committed: 3000,
        available: 7000,
      });
    });

    it('returns allowed=false when PO would exceed available budget', async () => {
      const manager = makeManager({
        findOne: jest.fn().mockResolvedValue({ id: 'sup-1', budgetCap: 10000 }),
        query: jest.fn()
          .mockResolvedValueOnce([]) // advisory lock
          .mockResolvedValueOnce([{ committed: '8000' }]),
      });

      const result = await service.checkAndEnforce(manager as any, 'sup-1', 3000);

      expect(result).toEqual({
        allowed: false,
        cap: 10000,
        committed: 8000,
        available: 2000,
      });
    });

    it('returns allowed=false when committed already equals cap (available=0)', async () => {
      const manager = makeManager({
        findOne: jest.fn().mockResolvedValue({ id: 'sup-1', budgetCap: 5000 }),
        query: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ committed: '5000' }]),
      });

      const result = await service.checkAndEnforce(manager as any, 'sup-1', 1);

      expect(result.allowed).toBe(false);
      expect(result.available).toBe(0);
    });

    it('acquires advisory lock keyed on supplier budget slot', async () => {
      const queryMock = jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ committed: '0' }]);
      const manager = makeManager({
        findOne: jest.fn().mockResolvedValue({ id: 'sup-abc', budgetCap: 1000 }),
        query: queryMock,
      });

      await service.checkAndEnforce(manager as any, 'sup-abc', 100);

      expect(queryMock).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('pg_advisory_xact_lock'),
        ['budget-sup-abc'],
      );
    });
  });

  // ── recordOverride ─────────────────────────────────────────────────────────

  describe('recordOverride', () => {
    it('saves a BudgetOverride record and emits an audit log', async () => {
      const saveMock = jest.fn().mockResolvedValue({});
      const createMock = jest.fn((_, data) => data);
      const manager = makeManager({ create: createMock, save: saveMock });

      await service.recordOverride(
        manager as any,
        'po-1',
        'sup-1',
        'admin-user',
        5000,
        2000,
        'Emergency greenhouse restock approved by board',
      );

      expect(saveMock).toHaveBeenCalledWith(
        BudgetOverride,
        expect.objectContaining({
          poId: 'po-1',
          supplierId: 'sup-1',
          authorizedBy: 'admin-user',
          overrideAmount: 5000,
          availableAtTime: 2000,
          reason: 'Emergency greenhouse restock approved by board',
        }),
      );

      expect(auditService.log).toHaveBeenCalledWith(
        'admin-user',
        AuditAction.BUDGET_OVERRIDE,
        'PurchaseOrder',
        'po-1',
        expect.objectContaining({ supplierId: 'sup-1', poAmount: 5000 }),
      );
    });
  });

  // ── getBudgetStatus ────────────────────────────────────────────────────────

  describe('getBudgetStatus', () => {
    it('throws NotFoundException when supplier does not exist', async () => {
      supplierRepo.findOne.mockResolvedValue(null);

      await expect(service.getBudgetStatus('ghost')).rejects.toThrow(NotFoundException);
    });

    it('returns cap=null when no cap is set', async () => {
      supplierRepo.findOne.mockResolvedValue({ id: 'sup-1', budgetCap: null });

      const result = await service.getBudgetStatus('sup-1');

      expect(result).toEqual({ allowed: true, cap: null, committed: 0, available: null });
    });

    it('returns correct committed / available when cap is set', async () => {
      supplierRepo.findOne.mockResolvedValue({ id: 'sup-1', budgetCap: 20000 });
      dataSource.query.mockResolvedValue([{ committed: '12000' }]);

      const result = await service.getBudgetStatus('sup-1');

      expect(result).toEqual({
        allowed: true,
        cap: 20000,
        committed: 12000,
        available: 8000,
      });
    });
  });
});
