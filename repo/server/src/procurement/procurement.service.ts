import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, ILike } from 'typeorm';
import { PurchaseRequest } from './entities/purchase-request.entity';
import { PurchaseRequestLineItem } from './entities/purchase-request-line-item.entity';
import { Approval } from './entities/approval.entity';
import { RequestStatus } from '../common/enums/request-status.enum';
import { ApprovalAction } from '../common/enums/approval-action.enum';
import { AuditAction } from '../common/enums/audit-action.enum';
import { NotificationType } from '../common/enums/notification-type.enum';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { ApprovalActionDto } from './dto/approval-action.dto';
import { QueryRequestsDto } from './dto/query-requests.dto';

// Approval tier thresholds
const AUTO_APPROVE_LIMIT = 500;
const SINGLE_APPROVAL_LIMIT = 5000;

@Injectable()
export class ProcurementService {
  constructor(
    @InjectRepository(PurchaseRequest)
    private readonly requestRepo: Repository<PurchaseRequest>,
    @InjectRepository(PurchaseRequestLineItem)
    private readonly lineItemRepo: Repository<PurchaseRequestLineItem>,
    @InjectRepository(Approval)
    private readonly approvalRepo: Repository<Approval>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    @Inject(forwardRef(() => PurchaseOrdersService))
    private readonly purchaseOrdersService: PurchaseOrdersService,
  ) {}

  private calculateApprovalTier(totalAmount: number): number {
    if (totalAmount <= AUTO_APPROVE_LIMIT) return 0;
    if (totalAmount <= SINGLE_APPROVAL_LIMIT) return 1;
    return 2;
  }

  private async generateRequestNumber(): Promise<string> {
    const result = await this.dataSource.query(
      `SELECT nextval('pr_number_seq') as seq`,
    );
    const seq = parseInt(result[0].seq, 10);
    const year = new Date().getFullYear();
    return `PR-${year}-${String(seq).padStart(5, '0')}`;
  }

  async findAll(query: QueryRequestsDto, userId?: string) {
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const skip = (page - 1) * limit;

    const qb = this.requestRepo
      .createQueryBuilder('pr')
      .leftJoinAndSelect('pr.requester', 'requester')
      .leftJoinAndSelect('pr.supplier', 'supplier')
      .leftJoinAndSelect('pr.lineItems', 'lineItems');

    if (query.status) {
      qb.andWhere('pr.status = :status', { status: query.status });
    }

    if (query.search) {
      qb.andWhere(
        '(pr.requestNumber ILIKE :search OR pr.title ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = (query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') as 'ASC' | 'DESC';
    const allowedSorts = ['requestNumber', 'title', 'totalAmount', 'status', 'createdAt'];
    const orderField = allowedSorts.includes(sortBy) ? sortBy : 'createdAt';

    qb.orderBy(`pr.${orderField}`, sortOrder);
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string): Promise<PurchaseRequest> {
    const request = await this.requestRepo.findOne({
      where: { id },
      relations: ['requester', 'supplier', 'lineItems', 'approvals', 'approvals.approver'],
    });
    if (!request) throw new NotFoundException('Purchase request not found');
    return request;
  }

  async create(dto: CreateRequestDto, userId: string): Promise<PurchaseRequest> {
    const requestNumber = await this.generateRequestNumber();

    const lineItems = dto.lineItems.map((li) => {
      const item = new PurchaseRequestLineItem();
      item.itemDescription = li.itemDescription;
      item.quantity = li.quantity;
      item.unitPrice = li.unitPrice;
      item.totalPrice = Number((li.quantity * li.unitPrice).toFixed(2));
      item.catalogItemId = li.catalogItemId ?? null;
      return item;
    });

    const totalAmount = lineItems.reduce((sum, li) => sum + Number(li.totalPrice), 0);

    const request = this.requestRepo.create({
      requestNumber,
      title: dto.title,
      description: dto.description ?? null,
      requestedBy: userId,
      supplierId: dto.supplierId ?? null,
      lineItems,
      totalAmount: Number(totalAmount.toFixed(2)),
      status: RequestStatus.DRAFT,
      approvalTier: this.calculateApprovalTier(totalAmount),
    });

    const saved = await this.requestRepo.save(request);

    await this.auditService.log(userId, AuditAction.PR_CREATED, 'PurchaseRequest', saved.id, {
      requestNumber: saved.requestNumber,
      totalAmount: saved.totalAmount,
    });

    return this.findById(saved.id);
  }

  async update(id: string, dto: UpdateRequestDto, userId: string): Promise<PurchaseRequest> {
    const request = await this.findById(id);

    if (request.status !== RequestStatus.DRAFT) {
      throw new BadRequestException('Can only edit requests in DRAFT status');
    }

    if (dto.title !== undefined) request.title = dto.title;
    if (dto.description !== undefined) request.description = dto.description;
    if (dto.supplierId !== undefined) request.supplierId = dto.supplierId;

    if (dto.lineItems !== undefined) {
      // Remove old line items
      await this.lineItemRepo.delete({ requestId: id });

      request.lineItems = dto.lineItems.map((li) => {
        const item = new PurchaseRequestLineItem();
        item.requestId = id;
        item.itemDescription = li.itemDescription;
        item.quantity = li.quantity;
        item.unitPrice = li.unitPrice;
        item.totalPrice = Number((li.quantity * li.unitPrice).toFixed(2));
        item.catalogItemId = li.catalogItemId ?? null;
        return item;
      });

      const totalAmount = request.lineItems.reduce((sum, li) => sum + Number(li.totalPrice), 0);
      request.totalAmount = Number(totalAmount.toFixed(2));
      request.approvalTier = this.calculateApprovalTier(request.totalAmount);
    }

    await this.requestRepo.save(request);
    return this.findById(id);
  }

  async submit(id: string, userId: string): Promise<PurchaseRequest> {
    return this.dataSource.transaction(async (manager) => {
      const request = await manager.findOne(PurchaseRequest, {
        where: { id },
        relations: ['lineItems'],
      });

      if (!request) throw new NotFoundException('Purchase request not found');
      if (request.status !== RequestStatus.DRAFT) {
        throw new BadRequestException('Can only submit requests in DRAFT status');
      }
      if (!request.lineItems || request.lineItems.length === 0) {
        throw new BadRequestException('Cannot submit a request with no line items');
      }

      // Recalculate total and tier
      const totalAmount = request.lineItems.reduce((sum, li) => sum + Number(li.totalPrice), 0);
      request.totalAmount = Number(totalAmount.toFixed(2));
      request.approvalTier = this.calculateApprovalTier(request.totalAmount);

      if (request.approvalTier === 0) {
        // Auto-approve
        request.status = RequestStatus.APPROVED;
        await manager.save(request);

        await this.auditService.log(userId, AuditAction.PR_AUTO_APPROVED, 'PurchaseRequest', request.id, {
          requestNumber: request.requestNumber,
          totalAmount: request.totalAmount,
        });

        await this.notificationService.emit(
          request.requestedBy,
          NotificationType.REQUEST_APPROVED,
          'Request Auto-Approved',
          `Your purchase request ${request.requestNumber} has been automatically approved.`,
          { type: 'PurchaseRequest', id: request.id },
        );

        // Auto-generate a draft PO
        const fullRequest = await this.findById(request.id);
        await this.purchaseOrdersService.generateFromRequest(fullRequest, userId);
      } else {
        request.status = RequestStatus.PENDING_APPROVAL;
        await manager.save(request);

        await this.auditService.log(userId, AuditAction.PR_SUBMITTED, 'PurchaseRequest', request.id, {
          requestNumber: request.requestNumber,
          totalAmount: request.totalAmount,
          approvalTier: request.approvalTier,
        });

        await this.notificationService.emit(
          request.requestedBy,
          NotificationType.SYSTEM_ALERT,
          'Request Pending Approval',
          `Your purchase request ${request.requestNumber} has been submitted and is awaiting approval (tier ${request.approvalTier}).`,
          { type: 'PurchaseRequest', id: request.id },
        );
      }

      return this.findById(request.id);
    });
  }

  async processApproval(
    requestId: string,
    dto: ApprovalActionDto,
    approverId: string,
  ): Promise<PurchaseRequest> {
    return this.dataSource.transaction(async (manager) => {
      const request = await manager.findOne(PurchaseRequest, {
        where: { id: requestId },
        relations: ['approvals'],
      });

      if (!request) throw new NotFoundException('Purchase request not found');
      if (request.status !== RequestStatus.PENDING_APPROVAL) {
        throw new BadRequestException('Request is not pending approval');
      }
      if (request.requestedBy === approverId) {
        throw new ForbiddenException('Cannot approve your own request');
      }

      // Check if this user already approved this request
      const alreadyApproved = request.approvals.some(
        (a) => a.approverId === approverId && a.action === ApprovalAction.APPROVE,
      );
      if (alreadyApproved) {
        throw new BadRequestException('You have already approved this request');
      }

      // Record the approval/rejection
      const approval = manager.create(Approval, {
        requestId,
        approverId,
        action: dto.action,
        comments: dto.comments ?? null,
      });
      await manager.save(approval);

      if (dto.action === ApprovalAction.REJECT) {
        request.status = RequestStatus.REJECTED;
        await manager.save(request);

        await this.auditService.log(approverId, AuditAction.PR_REJECTED, 'PurchaseRequest', request.id, {
          requestNumber: request.requestNumber,
          comments: dto.comments,
        });

        await this.notificationService.emit(
          request.requestedBy,
          NotificationType.REQUEST_REJECTED,
          'Request Rejected',
          `Your purchase request ${request.requestNumber} has been rejected.${dto.comments ? ` Reason: ${dto.comments}` : ''}`,
          { type: 'PurchaseRequest', id: request.id },
        );
      } else {
        // Count total approvals (including the one we just added)
        const approvalCount =
          request.approvals.filter((a) => a.action === ApprovalAction.APPROVE).length + 1;
        const requiredApprovals = request.approvalTier === 2 ? 2 : 1;

        if (approvalCount >= requiredApprovals) {
          request.status = RequestStatus.APPROVED;
          await manager.save(request);

          await this.auditService.log(approverId, AuditAction.PR_APPROVED, 'PurchaseRequest', request.id, {
            requestNumber: request.requestNumber,
            approvalCount,
            requiredApprovals,
          });

          await this.notificationService.emit(
            request.requestedBy,
            NotificationType.REQUEST_APPROVED,
            'Request Approved',
            `Your purchase request ${request.requestNumber} has been fully approved.`,
            { type: 'PurchaseRequest', id: request.id },
          );

          // Generate draft PO on full approval
          const fullRequest = await this.findById(request.id);
          await this.purchaseOrdersService.generateFromRequest(fullRequest, approverId);
        } else {
          // Still needs more approvals
          await this.auditService.log(approverId, AuditAction.PR_APPROVED, 'PurchaseRequest', request.id, {
            requestNumber: request.requestNumber,
            approvalCount,
            requiredApprovals,
            partial: true,
          });

          await this.notificationService.emit(
            request.requestedBy,
            NotificationType.SYSTEM_ALERT,
            'Partial Approval Received',
            `Purchase request ${request.requestNumber} has received ${approvalCount} of ${requiredApprovals} required approvals.`,
            { type: 'PurchaseRequest', id: request.id },
          );
        }
      }

      return this.findById(requestId);
    });
  }

  async cancel(id: string, userId: string): Promise<PurchaseRequest> {
    const request = await this.findById(id);
    if (request.status === RequestStatus.CANCELLED || request.status === RequestStatus.APPROVED) {
      throw new BadRequestException('Cannot cancel a request that is already approved or cancelled');
    }

    request.status = RequestStatus.CANCELLED;
    await this.requestRepo.save(request);

    await this.auditService.log(userId, AuditAction.PR_CANCELLED, 'PurchaseRequest', request.id, {
      requestNumber: request.requestNumber,
    });

    return this.findById(id);
  }

  async getApprovalQueue(query: QueryRequestsDto) {
    // Returns all PENDING_APPROVAL requests for the approval queue
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const skip = (page - 1) * limit;

    const [data, total] = await this.requestRepo.findAndCount({
      where: { status: RequestStatus.PENDING_APPROVAL },
      relations: ['requester', 'supplier', 'lineItems', 'approvals', 'approvals.approver'],
      order: { createdAt: 'ASC' },
      skip,
      take: limit,
    });

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Low-stock alert ingest ────────────────────────────────────────────────

  async ingestLowStockAlert(
    dto: {
      title: string;
      supplierId?: string;
      items: { description: string; quantity: number; unitPrice: number }[];
      notes?: string;
    },
    requestedBy: string,
  ): Promise<PurchaseRequest> {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Low-stock alert must include at least one item');
    }

    const createDto: CreateRequestDto = {
      title: dto.title,
      supplierId: dto.supplierId,
      description: dto.notes
        ? `[Low-Stock Alert] ${dto.notes}`
        : '[Low-Stock Alert] Automatically generated from stock monitoring',
      lineItems: dto.items.map((item) => ({
        itemDescription: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    };

    const request = await this.create(createDto, requestedBy);
    const submitted = await this.submit(request.id, requestedBy);

    await this.auditService.log(
      requestedBy,
      AuditAction.STOCK_ALERT_INGESTED,
      'PurchaseRequest',
      submitted.id,
      {
        requestNumber: submitted.requestNumber,
        totalAmount: submitted.totalAmount,
        itemCount: dto.items.length,
        source: 'low-stock-alert',
      },
    );

    // Notify all procurement managers
    const managers: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id FROM users WHERE role = 'PROCUREMENT_MANAGER' AND "isActive" = true`,
    );
    for (const mgr of managers) {
      await this.notificationService.emit(
        mgr.id,
        NotificationType.SYSTEM_ALERT,
        'Low-Stock Alert: New Purchase Request',
        `A low-stock alert created request ${submitted.requestNumber} for ${dto.items.length} ` +
          `item(s) totalling $${submitted.totalAmount}. ` +
          `${submitted.status === 'APPROVED' ? 'Auto-approved.' : 'Awaiting approval.'}`,
        { type: 'PurchaseRequest', id: submitted.id },
      );
    }

    return submitted;
  }
}
