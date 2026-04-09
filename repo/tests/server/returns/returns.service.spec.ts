/**
 * Unit tests for ReturnsService — return-to-refund lifecycle, policy window
 * boundary conditions, and role checks for status transitions.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReturnsService } from '../../../server/src/returns/returns.service';
import { ReturnAuthorization } from '../../../server/src/returns/entities/return-authorization.entity';
import { ReturnLineItem } from '../../../server/src/returns/entities/return-line-item.entity';
import { ReturnPolicy } from '../../../server/src/returns/entities/return-policy.entity';
import { Receipt } from '../../../server/src/receiving/entities/receipt.entity';
import { ReceiptLineItem } from '../../../server/src/receiving/entities/receipt-line-item.entity';
import { AuditService } from '../../../server/src/audit/audit.service';
import { NotificationService } from '../../../server/src/notifications/notification.service';
import { FundsLedgerService } from '../../../server/src/funds-ledger/funds-ledger.service';
import { ReturnStatus } from '../../../server/src/common/enums/return-status.enum';
import { ReceiptStatus } from '../../../server/src/common/enums/receipt-status.enum';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makePolicy = (): ReturnPolicy =>
  ({ id: 1, returnWindowDays: 14, restockingFeeDefault: 10, restockingFeeAfterDaysThreshold: 7, restockingFeeAfterDays: 20 }) as ReturnPolicy;

const makeReceipt = (daysSinceReceived: number): Receipt => {
  const receivedAt = new Date(Date.now() - daysSinceReceived * 24 * 60 * 60 * 1000);
  return {
    id: 'rec-1',
    poId: 'po-1',
    status: ReceiptStatus.COMPLETED,
    receivedAt,
    purchaseOrder: { supplierId: 'sup-1' },
    lineItems: [
      {
        id: 'rli-1',
        quantityReceived: 10,
        poLineItem: { unitPrice: 20 },
      },
    ],
  } as unknown as Receipt;
};

const makeRA = (overrides: Partial<ReturnAuthorization> = {}): ReturnAuthorization =>
  ({
    id: 'ra-1',
    raNumber: 'RA-2024-00001',
    receiptId: 'rec-1',
    poId: 'po-1',
    supplierId: 'sup-1',
    createdBy: 'user-1',
    status: ReturnStatus.DRAFT,
    returnWindowDays: 14,
    returnDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    lineItems: [
      { id: 'rli-1', refundAmount: 180, restockingFeeAmount: 20 },
    ],
    ...overrides,
  }) as unknown as ReturnAuthorization;

// ── Suite ────────────────────────────────────────────────────────────────────

describe('ReturnsService', () => {
  let service: ReturnsService;

  const raRepo = {
    create: jest.fn((data: unknown) => data),
    save: jest.fn(async (data: unknown) => ({ ...data as object, id: 'ra-1' })),
    findOne: jest.fn(),
    update: jest.fn(async () => undefined),
  };
  const rliRepo = {};
  const policyRepo = { findOne: jest.fn(), save: jest.fn() };
  const receiptRepo = { findOne: jest.fn() };
  const receiptLiRepo = {};
  const auditService = { log: jest.fn(async () => undefined) };
  const notificationService = { emit: jest.fn(async () => undefined) };
  const fundsLedger = { recordRefund: jest.fn(async () => undefined) };
  const dataSource = {
    query: jest.fn(async () => [{ seq: '1' }]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnsService,
        { provide: getRepositoryToken(ReturnAuthorization), useValue: raRepo },
        { provide: getRepositoryToken(ReturnLineItem), useValue: rliRepo },
        { provide: getRepositoryToken(ReturnPolicy), useValue: policyRepo },
        { provide: getRepositoryToken(Receipt), useValue: receiptRepo },
        { provide: getRepositoryToken(ReceiptLineItem), useValue: receiptLiRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: auditService },
        { provide: NotificationService, useValue: notificationService },
        { provide: FundsLedgerService, useValue: fundsLedger },
      ],
    }).compile();

    service = module.get<ReturnsService>(ReturnsService);
    jest.clearAllMocks();

    policyRepo.findOne.mockResolvedValue(makePolicy());
  });

  // ── Return window boundary ──────────────────────────────────────────────

  describe('create — return policy window', () => {
    it('allows return on day 14 (exactly at window boundary)', async () => {
      receiptRepo.findOne.mockResolvedValue(makeReceipt(14));
      raRepo.findOne.mockResolvedValue(makeRA());

      await expect(
        service.create('user-1', {
          receiptId: 'rec-1',
          lineItems: [{ receiptLineItemId: 'rli-1', quantityReturned: 1, reasonCode: 'WRONG_ITEM' as any }],
        }),
      ).resolves.toBeDefined();
    });

    it('rejects return on day 15 (beyond 14-day window)', async () => {
      receiptRepo.findOne.mockResolvedValue(makeReceipt(15));

      await expect(
        service.create('user-1', {
          receiptId: 'rec-1',
          lineItems: [{ receiptLineItemId: 'rli-1', quantityReturned: 1, reasonCode: 'WRONG_ITEM' as any }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects return against non-completed receipt', async () => {
      const receipt = makeReceipt(1);
      (receipt as any).status = 'IN_PROGRESS';
      receiptRepo.findOne.mockResolvedValue(receipt);

      await expect(
        service.create('user-1', {
          receiptId: 'rec-1',
          lineItems: [{ receiptLineItemId: 'rli-1', quantityReturned: 1, reasonCode: 'WRONG_ITEM' as any }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── Completion → refund ledger ──────────────────────────────────────────

  describe('updateStatus — completion triggers refund', () => {
    it('records refund in funds ledger on COMPLETED', async () => {
      raRepo.findOne.mockResolvedValue(makeRA({ status: ReturnStatus.APPROVED }));

      await service.updateStatus('ra-1', 'admin-1', ReturnStatus.COMPLETED);

      expect(fundsLedger.recordRefund).toHaveBeenCalledWith(
        'sup-1',
        180, // total refundAmount from line items
        'ra-1',
        'admin-1',
      );
    });

    it('does NOT record refund on CANCELLED', async () => {
      raRepo.findOne.mockResolvedValue(makeRA({ status: ReturnStatus.APPROVED }));

      await service.updateStatus('ra-1', 'admin-1', ReturnStatus.CANCELLED);

      expect(fundsLedger.recordRefund).not.toHaveBeenCalled();
    });

    it('rejects status change on already-completed return', async () => {
      raRepo.findOne.mockResolvedValue(makeRA({ status: ReturnStatus.COMPLETED }));

      await expect(
        service.updateStatus('ra-1', 'admin-1', ReturnStatus.APPROVED),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── Submit — re-validates window ────────────────────────────────────────

  describe('submit — re-validates return window', () => {
    it('rejects submission when return deadline has passed', async () => {
      const expiredRA = makeRA({
        status: ReturnStatus.DRAFT,
        returnDeadline: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });
      raRepo.findOne.mockResolvedValue(expiredRA);

      await expect(service.submit('ra-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('allows submission within window', async () => {
      raRepo.findOne.mockResolvedValue(makeRA({ status: ReturnStatus.DRAFT }));

      await expect(service.submit('ra-1', 'user-1')).resolves.toBeDefined();
    });
  });
});
