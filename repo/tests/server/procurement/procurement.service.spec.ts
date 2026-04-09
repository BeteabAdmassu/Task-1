import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProcurementService } from '../../../server/src/procurement/procurement.service';
import { PurchaseRequest } from '../../../server/src/procurement/entities/purchase-request.entity';
import { PurchaseRequestLineItem } from '../../../server/src/procurement/entities/purchase-request-line-item.entity';
import { Approval } from '../../../server/src/procurement/entities/approval.entity';
import { RequestStatus } from '../../../server/src/common/enums/request-status.enum';
import { ApprovalAction } from '../../../server/src/common/enums/approval-action.enum';
import { AuditService } from '../../../server/src/audit/audit.service';
import { NotificationService } from '../../../server/src/notifications/notification.service';
import { PurchaseOrdersService } from '../../../server/src/purchase-orders/purchase-orders.service';
import { Role } from '../../../server/src/common/enums/role.enum';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeRequest = (overrides: Partial<PurchaseRequest> = {}): PurchaseRequest =>
  ({
    id: 'req-1',
    requestNumber: 'PR-2024-00001',
    title: 'Test Request',
    description: null,
    requestedBy: 'user-1',
    supplierId: null,
    status: RequestStatus.DRAFT,
    totalAmount: 100,
    approvalTier: 0,
    lineItems: [
      { id: 'li-1', itemDescription: 'Widget', quantity: 1, unitPrice: 100, totalPrice: 100 } as PurchaseRequestLineItem,
    ],
    approvals: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as PurchaseRequest;

describe('ProcurementService — approval tier logic', () => {
  let service: ProcurementService;

  const requestRepo = { findOne: jest.fn(), save: jest.fn(), findAndCount: jest.fn() };
  const lineItemRepo = { delete: jest.fn() };
  const approvalRepo = {};

  // DataSource mocks a transactional context
  const dataSource = {
    query: jest.fn(async () => [{ seq: '1' }]),
    transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) => {
      const manager = {
        findOne: jest.fn(),
        save: jest.fn(async (Entity: unknown, data: unknown) => data),
        create: jest.fn((_Entity: unknown, data: unknown) => data),
        update: jest.fn(async () => undefined),
      };
      return fn(manager);
    }),
  };

  const auditService = { log: jest.fn() };
  const notificationService = { emit: jest.fn() };
  const purchaseOrdersService = { generateFromRequest: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcurementService,
        { provide: getRepositoryToken(PurchaseRequest), useValue: requestRepo },
        { provide: getRepositoryToken(PurchaseRequestLineItem), useValue: lineItemRepo },
        { provide: getRepositoryToken(Approval), useValue: approvalRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: auditService },
        { provide: NotificationService, useValue: notificationService },
        { provide: PurchaseOrdersService, useValue: purchaseOrdersService },
      ],
    }).compile();

    service = module.get<ProcurementService>(ProcurementService);
    jest.clearAllMocks();
  });

  // ── calculateApprovalTier (via submit) ────────────────────────────────

  describe('approval tier thresholds', () => {
    const runSubmit = (totalAmount: number) => {
      const request = makeRequest({
        status: RequestStatus.DRAFT,
        totalAmount,
        lineItems: [
          { id: 'li-1', itemDescription: 'Item', quantity: 1, unitPrice: totalAmount, totalPrice: totalAmount } as PurchaseRequestLineItem,
        ],
      });

      dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
        const manager = {
          findOne: jest.fn(async () => request),
          save: jest.fn(async (_Entity: unknown, data: unknown) => data ?? request),
        };
        requestRepo.findOne.mockResolvedValue({ ...request, approvals: [], lineItems: request.lineItems });
        purchaseOrdersService.generateFromRequest.mockResolvedValue({});
        return fn(manager);
      });

      return service.submit('req-1', 'user-1');
    };

    it('tier 0: auto-approves requests ≤ $500', async () => {
      await runSubmit(500);
      expect(auditService.log).toHaveBeenCalledWith(
        'user-1',
        expect.stringContaining('AUTO_APPROVED'),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(purchaseOrdersService.generateFromRequest).toHaveBeenCalled();
    });

    it('tier 0: auto-approves exactly at $500 boundary', async () => {
      await runSubmit(500);
      expect(purchaseOrdersService.generateFromRequest).toHaveBeenCalled();
    });

    it('tier 1: goes to PENDING_APPROVAL for $501', async () => {
      await runSubmit(501);
      expect(auditService.log).toHaveBeenCalledWith(
        'user-1',
        expect.stringContaining('SUBMITTED'),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(purchaseOrdersService.generateFromRequest).not.toHaveBeenCalled();
    });

    it('tier 1: requires single approval for $5000', async () => {
      await runSubmit(5000);
      expect(purchaseOrdersService.generateFromRequest).not.toHaveBeenCalled();
    });

    it('tier 2: requires dual approval for $5001', async () => {
      await runSubmit(5001);
      expect(purchaseOrdersService.generateFromRequest).not.toHaveBeenCalled();
    });
  });

  // ── processApproval ───────────────────────────────────────────────────

  describe('processApproval', () => {
    it('rejects when request is not pending approval', async () => {
      dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
        const manager = {
          findOne: jest.fn(async () => makeRequest({ status: RequestStatus.DRAFT, approvals: [] })),
          save: jest.fn(),
          create: jest.fn((_E: unknown, d: unknown) => d),
          update: jest.fn(async () => undefined),
        };
        return fn(manager);
      });

      await expect(
        service.processApproval('req-1', { action: ApprovalAction.APPROVE }, 'approver-1', Role.PROCUREMENT_MANAGER, false),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when approver is the requester', async () => {
      dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
        const manager = {
          findOne: jest.fn(async () =>
            makeRequest({ status: RequestStatus.PENDING_APPROVAL, requestedBy: 'approver-1', approvals: [] }),
          ),
          save: jest.fn(),
          create: jest.fn((_E: unknown, d: unknown) => d),
          update: jest.fn(async () => undefined),
        };
        return fn(manager);
      });

      await expect(
        service.processApproval('req-1', { action: ApprovalAction.APPROVE }, 'approver-1', Role.PROCUREMENT_MANAGER, false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects when user already approved', async () => {
      dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
        const manager = {
          findOne: jest.fn(async () =>
            makeRequest({
              status: RequestStatus.PENDING_APPROVAL,
              requestedBy: 'user-1',
              approvals: [
                { approverId: 'approver-1', action: ApprovalAction.APPROVE, approver: { role: Role.PROCUREMENT_MANAGER } } as unknown as Approval,
              ],
            }),
          ),
          save: jest.fn(),
          create: jest.fn((_E: unknown, d: unknown) => d),
          update: jest.fn(async () => undefined),
        };
        return fn(manager);
      });

      await expect(
        service.processApproval('req-1', { action: ApprovalAction.APPROVE }, 'approver-1', Role.PROCUREMENT_MANAGER, false),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── processApproval — tier-2 authority ───────────────────────────────

  describe('processApproval — tier-2 authority', () => {
    const makeTier2Request = (approvals: Partial<Approval>[] = []) =>
      makeRequest({
        status: RequestStatus.PENDING_APPROVAL,
        requestedBy: 'user-1',
        totalAmount: 6000,
        approvalTier: 2,
        approvals: approvals as Approval[],
      });

    it('blocks finalization when both approvers are PROCUREMENT_MANAGER (no ADMINISTRATOR)', async () => {
      dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
        const manager = {
          findOne: jest.fn(async () =>
            makeTier2Request([
              { approverId: 'pm-1', action: ApprovalAction.APPROVE, approver: { role: Role.PROCUREMENT_MANAGER } as unknown as import('../users/user.entity').User },
            ]),
          ),
          save: jest.fn(),
          create: jest.fn((_E: unknown, d: unknown) => d),
          update: jest.fn(async () => undefined),
        };
        requestRepo.findOne.mockResolvedValue(makeTier2Request());
        return fn(manager);
      });

      await expect(
        service.processApproval('req-1', { action: ApprovalAction.APPROVE }, 'pm-2', Role.PROCUREMENT_MANAGER, true),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows finalization when at least one approver is ADMINISTRATOR', async () => {
      dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
        const manager = {
          findOne: jest.fn(async () =>
            makeTier2Request([
              { approverId: 'pm-1', action: ApprovalAction.APPROVE, approver: { role: Role.PROCUREMENT_MANAGER } as unknown as import('../users/user.entity').User },
            ]),
          ),
          save: jest.fn(async (_E: unknown, data: unknown) => data),
          create: jest.fn((_E: unknown, d: unknown) => d),
          update: jest.fn(async () => undefined),
        };
        requestRepo.findOne.mockResolvedValue({
          ...makeTier2Request(),
          approvals: [{ approverId: 'pm-1', action: ApprovalAction.APPROVE, approver: { role: Role.PROCUREMENT_MANAGER } as unknown as import('../users/user.entity').User }],
        });
        purchaseOrdersService.generateFromRequest.mockResolvedValue({});
        return fn(manager);
      });

      const result = await service.processApproval(
        'req-1',
        { action: ApprovalAction.APPROVE },
        'admin-1',
        Role.ADMINISTRATOR,
        false,
      );
      expect(result).toBeDefined();
    });

    it('allows tier-1 approval by PROCUREMENT_MANAGER without ADMINISTRATOR', async () => {
      const tier1Request = makeRequest({
        status: RequestStatus.PENDING_APPROVAL,
        requestedBy: 'user-1',
        totalAmount: 3000,
        approvalTier: 1,
        approvals: [],
      });

      dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
        const manager = {
          findOne: jest.fn(async () => tier1Request),
          save: jest.fn(async (_E: unknown, data: unknown) => data),
          create: jest.fn((_E: unknown, d: unknown) => d),
          update: jest.fn(async () => undefined),
        };
        requestRepo.findOne.mockResolvedValue({ ...tier1Request, approvals: [] });
        purchaseOrdersService.generateFromRequest.mockResolvedValue({});
        return fn(manager);
      });

      const result = await service.processApproval(
        'req-1',
        { action: ApprovalAction.APPROVE },
        'pm-1',
        Role.PROCUREMENT_MANAGER,
        true,
      );
      expect(result).toBeDefined();
    });
  });

  // ── processApproval — tier-1 supervisor authority ─────────────────────────────────

  describe('processApproval — tier-1 supervisor authority', () => {
    const makeTier1Request = () =>
      makeRequest({
        status: RequestStatus.PENDING_APPROVAL,
        requestedBy: 'user-1',
        totalAmount: 2000,
        approvalTier: 1,
        approvals: [],
      });

    it('blocks tier-1 approval for non-supervisor PROCUREMENT_MANAGER', async () => {
      dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
        const manager = {
          findOne: jest.fn(async () => makeTier1Request()),
          save: jest.fn(),
          create: jest.fn((_E: unknown, d: unknown) => d),
          update: jest.fn(async () => undefined),
        };
        return fn(manager);
      });

      await expect(
        service.processApproval('req-1', { action: ApprovalAction.APPROVE }, 'pm-1', Role.PROCUREMENT_MANAGER, false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows tier-1 approval for supervisor-flagged PROCUREMENT_MANAGER', async () => {
      dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
        const manager = {
          findOne: jest.fn(async () => makeTier1Request()),
          save: jest.fn(async (_E: unknown, data: unknown) => data),
          create: jest.fn((_E: unknown, d: unknown) => d),
          update: jest.fn(async () => undefined),
        };
        requestRepo.findOne.mockResolvedValue({ ...makeTier1Request(), approvals: [] });
        purchaseOrdersService.generateFromRequest.mockResolvedValue({});
        return fn(manager);
      });

      const result = await service.processApproval(
        'req-1',
        { action: ApprovalAction.APPROVE },
        'pm-1',
        Role.PROCUREMENT_MANAGER,
        true,
      );
      expect(result).toBeDefined();
    });

    it('allows tier-1 approval for ADMINISTRATOR regardless of isSupervisor flag', async () => {
      dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
        const manager = {
          findOne: jest.fn(async () => makeTier1Request()),
          save: jest.fn(async (_E: unknown, data: unknown) => data),
          create: jest.fn((_E: unknown, d: unknown) => d),
          update: jest.fn(async () => undefined),
        };
        requestRepo.findOne.mockResolvedValue({ ...makeTier1Request(), approvals: [] });
        purchaseOrdersService.generateFromRequest.mockResolvedValue({});
        return fn(manager);
      });

      const result = await service.processApproval(
        'req-1',
        { action: ApprovalAction.APPROVE },
        'admin-1',
        Role.ADMINISTRATOR,
        false,
      );
      expect(result).toBeDefined();
    });

    it('allows REJECT action by non-supervisor (no supervisor check on rejection)', async () => {
      dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
        const manager = {
          findOne: jest.fn(async () => makeTier1Request()),
          save: jest.fn(async (_E: unknown, data: unknown) => data),
          create: jest.fn((_E: unknown, d: unknown) => d),
          update: jest.fn(async () => undefined),
        };
        requestRepo.findOne.mockResolvedValue({ ...makeTier1Request(), approvals: [] });
        return fn(manager);
      });

      const result = await service.processApproval(
        'req-1',
        { action: ApprovalAction.REJECT, comments: 'Budget not available' },
        'pm-1',
        Role.PROCUREMENT_MANAGER,
        false,
      );
      expect(result).toBeDefined();
    });
  });

  // ── findById ──────────────────────────────────────────────────────────

  describe('findById', () => {
    it('throws 404 when request not found', async () => {
      requestRepo.findOne.mockResolvedValue(null);
      await expect(service.findById('no-such-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── ingestLowStockAlert ───────────────────────────────────────────────

  describe('ingestLowStockAlert', () => {
    it('throws 400 when items array is empty', async () => {
      await expect(
        service.ingestLowStockAlert({ title: 'Test', items: [] }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
