import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Receipt } from './entities/receipt.entity';
import { ReceiptLineItem } from './entities/receipt-line-item.entity';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { PurchaseOrderLineItem } from '../purchase-orders/entities/purchase-order-line-item.entity';
import { ReceiptStatus } from '../common/enums/receipt-status.enum';
import { ReceivingEntryMode } from '../common/enums/receiving-entry-mode.enum';
import { VarianceReasonCode } from '../common/enums/variance-reason-code.enum';
import { PoStatus } from '../common/enums/po-status.enum';
import { AuditAction } from '../common/enums/audit-action.enum';
import { NotificationType } from '../common/enums/notification-type.enum';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { QueryReceiptsDto } from './dto/query-receipts.dto';

@Injectable()
export class ReceivingService {
  constructor(
    @InjectRepository(Receipt)
    private readonly receiptRepo: Repository<Receipt>,
    @InjectRepository(ReceiptLineItem)
    private readonly rliRepo: Repository<ReceiptLineItem>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  private async generateReceiptNumber(): Promise<string> {
    const result = await this.dataSource.query(
      `SELECT nextval('receipt_number_seq') as seq`,
    );
    const seq = parseInt(result[0].seq, 10);
    const year = new Date().getFullYear();
    return `REC-${year}-${String(seq).padStart(5, '0')}`;
  }

  async create(userId: string, dto: CreateReceiptDto): Promise<Receipt> {
    const po = await this.dataSource.getRepository(PurchaseOrder).findOne({
      where: { id: dto.poId },
      relations: ['lineItems'],
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (![PoStatus.ISSUED, PoStatus.PARTIALLY_RECEIVED].includes(po.status)) {
      throw new BadRequestException(
        'PO must be ISSUED or PARTIALLY_RECEIVED to receive against',
      );
    }

    const receiptNumber = await this.generateReceiptNumber();

    const lineItems = dto.lineItems.map((li) => {
      const variance = Number(li.quantityReceived) - Number(li.quantityExpected);
      if (variance !== 0 && (!li.varianceReasonCode || li.varianceReasonCode === VarianceReasonCode.NONE)) {
        throw new BadRequestException(
          `Variance on line item ${li.poLineItemId} requires a reason code`,
        );
      }
      const rli = new ReceiptLineItem();
      rli.poLineItemId = li.poLineItemId;
      rli.quantityExpected = Number(li.quantityExpected);
      rli.quantityReceived = Number(li.quantityReceived);
      rli.varianceQuantity = variance;
      rli.varianceReasonCode = li.varianceReasonCode ?? VarianceReasonCode.NONE;
      rli.varianceNotes = li.varianceNotes ?? null;
      rli.putawayLocationId = li.putawayLocationId ?? null;
      return rli;
    });

    const receipt = this.receiptRepo.create({
      receiptNumber,
      poId: dto.poId,
      receivedBy: userId,
      status: ReceiptStatus.IN_PROGRESS,
      entryMode: dto.entryMode ?? ReceivingEntryMode.MANUAL,
      notes: dto.notes ?? null,
      lineItems,
    });

    const saved = await this.receiptRepo.save(receipt);

    await this.auditService.log(
      userId,
      AuditAction.RECEIPT_CREATED,
      'Receipt',
      saved.id,
      { receiptNumber: saved.receiptNumber, poId: dto.poId },
    );

    return this.findById(saved.id);
  }

  async complete(id: string, userId: string): Promise<Receipt> {
    const receipt = await this.findById(id);
    if (receipt.status === ReceiptStatus.COMPLETED) {
      throw new BadRequestException('Receipt is already completed');
    }

    let newPoStatus: PoStatus = PoStatus.PARTIALLY_RECEIVED;

    await this.dataSource.transaction(async (manager) => {
      // Mark receipt completed
      await manager.update(Receipt, id, {
        status: ReceiptStatus.COMPLETED,
        receivedAt: new Date(),
      });

      // Accumulate quantityReceived increments per PO line item
      for (const rli of receipt.lineItems) {
        await manager
          .createQueryBuilder()
          .update(PurchaseOrderLineItem)
          .set({
            quantityReceived: () =>
              `"quantityReceived" + ${Number(rli.quantityReceived)}`,
          })
          .where('id = :id', { id: rli.poLineItemId })
          .execute();
      }

      // Re-fetch PO line items to determine new status
      const po = await manager.findOne(PurchaseOrder, {
        where: { id: receipt.poId },
        relations: ['lineItems'],
      });

      const allFullyReceived = po!.lineItems.every(
        (li) => Number(li.quantityReceived) >= Number(li.quantity),
      );
      newPoStatus = allFullyReceived
        ? PoStatus.FULLY_RECEIVED
        : PoStatus.PARTIALLY_RECEIVED;

      await manager.update(PurchaseOrder, receipt.poId, { status: newPoStatus });
    });

    await this.auditService.log(
      userId,
      AuditAction.RECEIPT_COMPLETED,
      'Receipt',
      id,
      { receiptNumber: receipt.receiptNumber, poId: receipt.poId, newPoStatus },
    );

    await this.notificationService.emit(
      userId,
      NotificationType.RECEIPT_COMPLETED,
      'Receipt Completed',
      `Receipt ${receipt.receiptNumber} has been completed. PO status is now ${newPoStatus}.`,
      { type: 'Receipt', id },
    );

    return this.findById(id);
  }

  async findAll(query: QueryReceiptsDto) {
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const skip = (page - 1) * limit;

    const qb = this.receiptRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.purchaseOrder', 'po')
      .leftJoinAndSelect('r.receiver', 'receiver')
      .leftJoinAndSelect('r.lineItems', 'lineItems')
      .leftJoinAndSelect('lineItems.putawayLocation', 'putawayLocation')
      .orderBy('r.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.poId) {
      qb.andWhere('r.poId = :poId', { poId: query.poId });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string): Promise<Receipt> {
    const receipt = await this.receiptRepo.findOne({
      where: { id },
      relations: ['purchaseOrder', 'receiver', 'lineItems', 'lineItems.putawayLocation', 'lineItems.poLineItem'],
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    return receipt;
  }
}
