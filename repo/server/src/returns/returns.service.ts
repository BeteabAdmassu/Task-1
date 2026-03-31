import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { ReturnAuthorization } from './entities/return-authorization.entity';
import { ReturnLineItem } from './entities/return-line-item.entity';
import { ReturnPolicy } from './entities/return-policy.entity';
import { Receipt } from '../receiving/entities/receipt.entity';
import { ReceiptLineItem } from '../receiving/entities/receipt-line-item.entity';
import { ReceiptStatus } from '../common/enums/receipt-status.enum';
import { ReturnStatus } from '../common/enums/return-status.enum';
import { AuditAction } from '../common/enums/audit-action.enum';
import { NotificationType } from '../common/enums/notification-type.enum';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { FundsLedgerService } from '../funds-ledger/funds-ledger.service';
import { RestockingFeeEngine } from './restocking-fee.engine';
import { CreateReturnDto } from './dto/create-return.dto';
import { QueryReturnsDto } from './dto/query-returns.dto';
import { UpdateReturnPolicyDto } from './dto/update-return-policy.dto';

const SUBMITTABLE = [ReturnStatus.DRAFT];
const CANCELLABLE = [ReturnStatus.DRAFT, ReturnStatus.SUBMITTED, ReturnStatus.APPROVED];

@Injectable()
export class ReturnsService {
  constructor(
    @InjectRepository(ReturnAuthorization)
    private readonly raRepo: Repository<ReturnAuthorization>,
    @InjectRepository(ReturnLineItem)
    private readonly rliRepo: Repository<ReturnLineItem>,
    @InjectRepository(ReturnPolicy)
    private readonly policyRepo: Repository<ReturnPolicy>,
    @InjectRepository(Receipt)
    private readonly receiptRepo: Repository<Receipt>,
    @InjectRepository(ReceiptLineItem)
    private readonly receiptLineItemRepo: Repository<ReceiptLineItem>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly fundsLedger: FundsLedgerService,
    private readonly notificationService: NotificationService,
  ) {}

  // ── Policy ────────────────────────────────────────────────────────────────

  async getPolicy(): Promise<ReturnPolicy> {
    const policy = await this.policyRepo.findOne({ where: { id: 1 } });
    if (!policy) throw new NotFoundException('Return policy not configured');
    return policy;
  }

  async updatePolicy(dto: UpdateReturnPolicyDto): Promise<ReturnPolicy> {
    const policy = await this.getPolicy();
    if (dto.returnWindowDays !== undefined) policy.returnWindowDays = dto.returnWindowDays;
    if (dto.restockingFeeDefault !== undefined) policy.restockingFeeDefault = dto.restockingFeeDefault;
    if (dto.restockingFeeAfterDaysThreshold !== undefined)
      policy.restockingFeeAfterDaysThreshold = dto.restockingFeeAfterDaysThreshold;
    if (dto.restockingFeeAfterDays !== undefined) policy.restockingFeeAfterDays = dto.restockingFeeAfterDays;
    return this.policyRepo.save(policy);
  }

  // ── Number generation ─────────────────────────────────────────────────────

  private async generateRaNumber(): Promise<string> {
    const result = await this.dataSource.query(`SELECT nextval('ra_number_seq') as seq`);
    const seq = parseInt(result[0].seq, 10);
    const year = new Date().getFullYear();
    return `RA-${year}-${String(seq).padStart(5, '0')}`;
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateReturnDto): Promise<ReturnAuthorization> {
    const policy = await this.getPolicy();

    const receipt = await this.receiptRepo.findOne({
      where: { id: dto.receiptId },
      relations: ['lineItems', 'lineItems.poLineItem', 'purchaseOrder'],
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    if (receipt.status !== ReceiptStatus.COMPLETED) {
      throw new BadRequestException('Can only create returns against completed receipts');
    }
    if (!receipt.receivedAt) {
      throw new BadRequestException('Receipt has no received date');
    }

    const now = new Date();
    const daysSinceReceipt = Math.floor(
      (now.getTime() - receipt.receivedAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSinceReceipt > policy.returnWindowDays) {
      throw new BadRequestException(
        `Return window of ${policy.returnWindowDays} days has expired (${daysSinceReceipt} days since receipt)`,
      );
    }

    const deadlineDate = new Date(receipt.receivedAt.getTime());
    deadlineDate.setDate(deadlineDate.getDate() + policy.returnWindowDays);
    const returnDeadline = deadlineDate.toISOString().split('T')[0];

    // Build line items with fee calculation
    const lineItems: ReturnLineItem[] = [];
    for (const liDto of dto.lineItems) {
      const receiptLi = receipt.lineItems.find((li) => li.id === liDto.receiptLineItemId);
      if (!receiptLi) {
        throw new NotFoundException(`Receipt line item ${liDto.receiptLineItemId} not found`);
      }
      if (Number(liDto.quantityReturned) > Number(receiptLi.quantityReceived)) {
        throw new BadRequestException(
          `Cannot return more than received quantity for line item ${receiptLi.id}`,
        );
      }

      const unitPrice = Number(receiptLi.poLineItem?.unitPrice ?? 0);
      const feePercent = RestockingFeeEngine.calculate(liDto.reasonCode, daysSinceReceipt, policy);
      const gross = Number(liDto.quantityReturned) * unitPrice;
      const feeAmount = parseFloat((gross * (feePercent / 100)).toFixed(2));
      const refundAmount = parseFloat((gross - feeAmount).toFixed(2));

      const rli = new ReturnLineItem();
      rli.receiptLineItemId = liDto.receiptLineItemId;
      rli.quantityReturned = Number(liDto.quantityReturned);
      rli.reasonCode = liDto.reasonCode;
      rli.reasonNotes = liDto.reasonNotes ?? null;
      rli.restockingFeePercent = feePercent;
      rli.restockingFeeAmount = feeAmount;
      rli.refundAmount = refundAmount;
      lineItems.push(rli);
    }

    const raNumber = await this.generateRaNumber();
    const ra = this.raRepo.create({
      raNumber,
      receiptId: dto.receiptId,
      poId: receipt.poId ?? null,
      supplierId: receipt.purchaseOrder?.supplierId ?? null,
      createdBy: userId,
      status: ReturnStatus.DRAFT,
      returnWindowDays: policy.returnWindowDays,
      returnDeadline,
      lineItems,
    });

    const saved = await this.raRepo.save(ra);

    await this.auditService.log(userId, AuditAction.RA_CREATED, 'ReturnAuthorization', saved.id, {
      raNumber: saved.raNumber,
      receiptId: dto.receiptId,
      daysSinceReceipt,
    });

    await this.notificationService.emit(
      userId,
      NotificationType.RETURN_CREATED,
      'Return Authorization Created',
      `Return authorization ${saved.raNumber} has been created as a draft.`,
      { type: 'ReturnAuthorization', id: saved.id },
    );

    return this.findById(saved.id);
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async submit(id: string, userId: string): Promise<ReturnAuthorization> {
    const ra = await this.findById(id);
    if (!SUBMITTABLE.includes(ra.status)) {
      throw new BadRequestException(`Cannot submit a return with status ${ra.status}`);
    }

    // Re-validate return window at submission time
    const policy = await this.getPolicy();
    const today = new Date();
    const deadline = new Date(ra.returnDeadline);
    if (today > deadline) {
      throw new BadRequestException('Return window has expired; this return can no longer be submitted');
    }

    await this.raRepo.update(id, { status: ReturnStatus.SUBMITTED });

    await this.auditService.log(userId, AuditAction.RA_SUBMITTED, 'ReturnAuthorization', id, {
      raNumber: ra.raNumber,
    });

    return this.findById(id);
  }

  // ── Status update ─────────────────────────────────────────────────────────

  async updateStatus(
    id: string,
    userId: string,
    newStatus: ReturnStatus,
  ): Promise<ReturnAuthorization> {
    const ra = await this.findById(id);

    if (newStatus === ReturnStatus.CANCELLED && !CANCELLABLE.includes(ra.status)) {
      throw new BadRequestException(`Cannot cancel a return with status ${ra.status}`);
    }
    if (ra.status === ReturnStatus.COMPLETED || ra.status === ReturnStatus.CANCELLED) {
      throw new BadRequestException(`Cannot change status of a ${ra.status} return`);
    }

    await this.raRepo.update(id, { status: newStatus });

    const auditAction =
      newStatus === ReturnStatus.COMPLETED ? AuditAction.RA_COMPLETED : AuditAction.RA_STATUS_CHANGED;

    await this.auditService.log(userId, auditAction, 'ReturnAuthorization', id, {
      raNumber: ra.raNumber,
      previousStatus: ra.status,
      newStatus,
    });

    if (newStatus === ReturnStatus.COMPLETED) {
      const totalRefund = ra.lineItems.reduce((s, li) => s + Number(li.refundAmount), 0);
      await this.fundsLedger.recordRefund(ra.supplierId ?? '', totalRefund, id, userId);
    }

    if (
      ra.createdBy &&
      (newStatus === ReturnStatus.APPROVED ||
        newStatus === ReturnStatus.COMPLETED ||
        newStatus === ReturnStatus.CANCELLED)
    ) {
      const statusLabels: Record<string, string> = {
        [ReturnStatus.APPROVED]: 'approved',
        [ReturnStatus.COMPLETED]: 'completed',
        [ReturnStatus.CANCELLED]: 'cancelled',
      };
      await this.notificationService.emit(
        ra.createdBy,
        NotificationType.REVIEW_OUTCOME,
        `Return ${statusLabels[newStatus] ?? newStatus}`,
        `Return authorization ${ra.raNumber} has been ${statusLabels[newStatus] ?? newStatus}.`,
        { type: 'ReturnAuthorization', id },
      );
    }

    return this.findById(id);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async findAll(query: QueryReturnsDto) {
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const skip = (page - 1) * limit;

    const qb = this.raRepo
      .createQueryBuilder('ra')
      .leftJoinAndSelect('ra.supplier', 'supplier')
      .leftJoinAndSelect('ra.receipt', 'receipt')
      .leftJoinAndSelect('ra.creator', 'creator')
      .leftJoinAndSelect('ra.lineItems', 'lineItems')
      .orderBy('ra.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status) qb.andWhere('ra.status = :status', { status: query.status });
    if (query.supplierId) qb.andWhere('ra.supplierId = :supplierId', { supplierId: query.supplierId });
    if (query.dateFrom && query.dateTo) {
      qb.andWhere('ra.createdAt BETWEEN :from AND :to', {
        from: new Date(query.dateFrom),
        to: new Date(query.dateTo),
      });
    } else if (query.dateFrom) {
      qb.andWhere('ra.createdAt >= :from', { from: new Date(query.dateFrom) });
    } else if (query.dateTo) {
      qb.andWhere('ra.createdAt <= :to', { to: new Date(query.dateTo) });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string): Promise<ReturnAuthorization> {
    const ra = await this.raRepo.findOne({
      where: { id },
      relations: [
        'supplier',
        'receipt',
        'purchaseOrder',
        'creator',
        'lineItems',
        'lineItems.receiptLineItem',
        'lineItems.receiptLineItem.poLineItem',
      ],
    });
    if (!ra) throw new NotFoundException('Return authorization not found');
    return ra;
  }

  // ── Supplier portal ───────────────────────────────────────────────────────

  async findForSupplier(supplierId: string, query: QueryReturnsDto) {
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 50);
    const skip = (page - 1) * limit;

    const qb = this.raRepo
      .createQueryBuilder('ra')
      .leftJoinAndSelect('ra.receipt', 'receipt')
      .leftJoinAndSelect('ra.lineItems', 'lineItems')
      .where('ra.supplierId = :supplierId', { supplierId })
      .andWhere('ra.status != :draft', { draft: ReturnStatus.DRAFT })
      .orderBy('ra.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status && query.status !== ReturnStatus.DRAFT) {
      qb.andWhere('ra.status = :status', { status: query.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findByIdForSupplier(id: string, supplierId: string): Promise<ReturnAuthorization> {
    const ra = await this.raRepo.findOne({
      where: { id, supplierId },
      relations: ['receipt', 'lineItems', 'lineItems.receiptLineItem', 'lineItems.receiptLineItem.poLineItem'],
    });
    if (!ra || ra.status === ReturnStatus.DRAFT) {
      throw new NotFoundException('Return authorization not found');
    }
    return ra;
  }
}
