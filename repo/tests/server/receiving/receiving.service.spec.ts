import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReceivingService } from '../../../server/src/receiving/receiving.service';
import { Receipt } from '../../../server/src/receiving/entities/receipt.entity';
import { ReceiptLineItem } from '../../../server/src/receiving/entities/receipt-line-item.entity';
import { AuditService } from '../../../server/src/audit/audit.service';
import { NotificationService } from '../../../server/src/notifications/notification.service';
import { ReceiptStatus } from '../../../server/src/common/enums/receipt-status.enum';
import { ReceivingEntryMode } from '../../../server/src/common/enums/receiving-entry-mode.enum';
import { PoStatus } from '../../../server/src/common/enums/po-status.enum';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makePo = (status = PoStatus.ISSUED) => ({
  id: 'po-1',
  status,
  lineItems: [
    { id: 'li-1', quantity: 10, quantityReceived: 0 },
    { id: 'li-2', quantity: 5, quantityReceived: 0 },
  ],
});

const makeLineItemDto = (overrides = {}) => ({
  poLineItemId: 'li-1',
  quantityReceived: 10,
  ...overrides,
});

const makeReceipt = (overrides = {}): Receipt =>
  ({
    id: 'rec-1',
    receiptNumber: 'REC-2024-00001',
    poId: 'po-1',
    receivedBy: 'user-1',
    status: ReceiptStatus.IN_PROGRESS,
    entryMode: ReceivingEntryMode.MANUAL,
    notes: null,
    lineItems: [
      { id: 'rli-1', poLineItemId: 'li-1', quantityReceived: 10 },
      { id: 'rli-2', poLineItemId: 'li-2', quantityReceived: 5 },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as unknown as Receipt;

describe('ReceivingService', () => {
  let service: ReceivingService;

  const receiptRepo = {
    create: jest.fn((data: unknown) => data),
    save: jest.fn(async (r: unknown) => ({ ...r as object, id: 'rec-1' })),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const rliRepo = {};

  const auditService = { log: jest.fn(async () => undefined) };
  const notificationService = { emit: jest.fn(async () => undefined) };

  const poRepository = {
    findOne: jest.fn(),
  };

  const dataSource = {
    query: jest.fn(async () => [{ seq: '1' }]),
    getRepository: jest.fn(() => poRepository),
    transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) => {
      const manager = {
        update: jest.fn(async () => undefined),
        createQueryBuilder: jest.fn(() => ({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          execute: jest.fn(async () => undefined),
        })),
        findOne: jest.fn(async () => ({
          id: 'po-1',
          lineItems: [
            { id: 'li-1', quantity: 10, quantityReceived: 10 },
            { id: 'li-2', quantity: 5, quantityReceived: 5 },
          ],
        })),
      };
      return fn(manager);
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceivingService,
        { provide: getRepositoryToken(Receipt), useValue: receiptRepo },
        { provide: getRepositoryToken(ReceiptLineItem), useValue: rliRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: auditService },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    service = module.get<ReceivingService>(ReceivingService);
    jest.clearAllMocks();

    // Default mock: findById returns a receipt
    receiptRepo.findOne.mockResolvedValue(makeReceipt());
    poRepository.findOne.mockResolvedValue(makePo());
    dataSource.getRepository.mockReturnValue(poRepository);
  });

  // ── create — entry mode ───────────────────────────────────────────────────

  describe('create — entry mode', () => {
    it('stores MANUAL entry mode when specified', async () => {
      const dto = {
        poId: 'po-1',
        entryMode: ReceivingEntryMode.MANUAL,
        lineItems: [makeLineItemDto()],
      };

      await service.create('user-1', dto);

      expect(receiptRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ entryMode: ReceivingEntryMode.MANUAL }),
      );
    });

    it('stores BARCODE entry mode when specified', async () => {
      const dto = {
        poId: 'po-1',
        entryMode: ReceivingEntryMode.BARCODE,
        lineItems: [makeLineItemDto()],
      };

      await service.create('user-1', dto);

      expect(receiptRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ entryMode: ReceivingEntryMode.BARCODE }),
      );
    });

    it('defaults to MANUAL when entryMode is not provided', async () => {
      const dto = {
        poId: 'po-1',
        lineItems: [makeLineItemDto()],
      };

      await service.create('user-1', dto);

      expect(receiptRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ entryMode: ReceivingEntryMode.MANUAL }),
      );
    });
  });

  // ── create — variance validation ─────────────────────────────────────────

  describe('create — variance reason code validation', () => {
    it('throws 400 when there is a variance but no reason code', async () => {
      const dto = {
        poId: 'po-1',
        lineItems: [
          makeLineItemDto({
            quantityReceived: 8, // variance = -2 from expected 10
            // varianceReasonCode omitted → defaults to NONE
          }),
        ],
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('accepts variance when a reason code is provided', async () => {
      const dto = {
        poId: 'po-1',
        lineItems: [
          makeLineItemDto({
            quantityReceived: 8,
            varianceReasonCode: 'SHORT_SHIPMENT',
          }),
        ],
      };

      await expect(service.create('user-1', dto)).resolves.toBeDefined();
    });

    it('accepts zero variance without a reason code', async () => {
      const dto = {
        poId: 'po-1',
        lineItems: [makeLineItemDto({ quantityReceived: 10 })],
      };

      await expect(service.create('user-1', dto)).resolves.toBeDefined();
    });
  });

  // ── create — PO status validation ────────────────────────────────────────

  describe('create — PO status validation', () => {
    it('throws 404 when PO does not exist', async () => {
      poRepository.findOne.mockResolvedValue(null);
      await expect(
        service.create('user-1', { poId: 'bad-id', lineItems: [makeLineItemDto()] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 400 when PO is not ISSUED or PARTIALLY_RECEIVED', async () => {
      poRepository.findOne.mockResolvedValue(makePo(PoStatus.FULLY_RECEIVED));
      await expect(
        service.create('user-1', { poId: 'po-1', lineItems: [makeLineItemDto()] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a PARTIALLY_RECEIVED PO', async () => {
      poRepository.findOne.mockResolvedValue(makePo(PoStatus.PARTIALLY_RECEIVED));
      await expect(
        service.create('user-1', { poId: 'po-1', lineItems: [makeLineItemDto()] }),
      ).resolves.toBeDefined();
    });
  });

  // ── create — server-derived expected quantity ─────────────────────────────

  describe('create — server-derived expected quantity', () => {
    it('derives quantityExpected from PO line (quantity − quantityReceived)', async () => {
      // PO line: quantity=10, quantityReceived=4 → remaining=6
      poRepository.findOne.mockResolvedValue({
        id: 'po-1',
        status: PoStatus.ISSUED,
        lineItems: [{ id: 'li-1', quantity: 10, quantityReceived: 4 }],
      });

      const dto = {
        poId: 'po-1',
        lineItems: [makeLineItemDto({ quantityReceived: 6 })],
      };

      await service.create('user-1', dto);

      expect(receiptRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lineItems: expect.arrayContaining([
            expect.objectContaining({ quantityExpected: 6, quantityReceived: 6 }),
          ]),
        }),
      );
    });

    it('throws 400 when poLineItemId does not belong to the PO', async () => {
      const dto = {
        poId: 'po-1',
        lineItems: [makeLineItemDto({ poLineItemId: 'li-unknown' })],
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('throws 400 when quantityReceived exceeds remaining expected quantity', async () => {
      // PO line: quantity=10, quantityReceived=0 → remaining=10; client submits 11
      const dto = {
        poId: 'po-1',
        lineItems: [makeLineItemDto({ quantityReceived: 11 })],
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('throws 400 when server-derived variance requires a reason code but none supplied', async () => {
      // PO line: remaining=10; client submits 7 → variance=-3; no reason code
      const dto = {
        poId: 'po-1',
        lineItems: [makeLineItemDto({ quantityReceived: 7 })],
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(BadRequestException);
    });
  });

  // ── complete — transactional ──────────────────────────────────────────────

  describe('complete', () => {
    it('uses a database transaction to update receipt and PO', async () => {
      await service.complete('rec-1', 'user-1');
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('throws 400 when receipt is already completed', async () => {
      receiptRepo.findOne.mockResolvedValue(
        makeReceipt({ status: ReceiptStatus.COMPLETED }),
      );
      await expect(service.complete('rec-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('emits a notification on completion', async () => {
      await service.complete('rec-1', 'user-1');
      expect(notificationService.emit).toHaveBeenCalled();
    });
  });
});
