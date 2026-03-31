import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProcurementService } from './procurement.service';
import { PurchaseRequest } from './entities/purchase-request.entity';
import { PurchaseRequestLineItem } from './entities/purchase-request-line-item.entity';
import { Approval } from './entities/approval.entity';
import { RequestStatus } from '../common/enums/request-status.enum';
import { ApprovalAction } from '../common/enums/approval-action.enum';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';

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
        };
        return fn(manager);
      });

      await expect(
        service.processApproval('req-1', { action: ApprovalAction.APPROVE }, 'approver-1'),
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
        };
        return fn(manager);
      });

      await expect(
        service.processApproval('req-1', { action: ApprovalAction.APPROVE }, 'approver-1'),
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
                { approverId: 'approver-1', action: ApprovalAction.APPROVE } as Approval,
              ],
            }),
          ),
          save: jest.fn(),
          create: jest.fn((_E: unknown, d: unknown) => d),
        };
        return fn(manager);
      });

      await expect(
        service.processApproval('req-1', { action: ApprovalAction.APPROVE }, 'approver-1'),
      ).rejects.toThrow(BadRequestException);
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
