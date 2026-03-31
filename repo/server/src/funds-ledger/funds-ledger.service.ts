import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { FundsLedgerEntry } from './entities/funds-ledger-entry.entity';
import { LedgerEntryType } from '../common/enums/ledger-entry-type.enum';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { QueryLedgerDto } from './dto/query-ledger.dto';

@Injectable()
export class FundsLedgerService {
  constructor(
    @InjectRepository(FundsLedgerEntry)
    private readonly entryRepo: Repository<FundsLedgerEntry>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Internal entry creator (must run inside a transaction) ────────────────

  private async createEntry(
    manager: EntityManager,
    supplierId: string,
    type: LedgerEntryType,
    amount: number,
    referenceType: string | null,
    referenceId: string | null,
    description: string | null,
    createdBy: string | null,
  ): Promise<FundsLedgerEntry> {
    // Advisory lock ensures single-writer serialization per supplier
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [supplierId]);

    // Get current running balance from the most recent entry
    const result = await manager.query(
      `SELECT "runningBalance" FROM funds_ledger_entries
       WHERE "supplierId" = $1
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      [supplierId],
    );
    const currentBalance = result.length > 0 ? Number(result[0].runningBalance) : 0;
    const newBalance = parseFloat((currentBalance + amount).toFixed(2));

    const entry = manager.create(FundsLedgerEntry, {
      supplierId,
      type,
      amount,
      runningBalance: newBalance,
      referenceType,
      referenceId: referenceId ?? null,
      description,
      createdBy,
    });
    return manager.save(FundsLedgerEntry, entry);
  }

  // ── Public mutation methods ───────────────────────────────────────────────

  async recordDeposit(
    supplierId: string,
    amount: number,
    referenceType?: string,
    referenceId?: string,
    description?: string,
    createdBy?: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.createEntry(
        manager,
        supplierId,
        LedgerEntryType.DEPOSIT,
        Math.abs(amount),
        referenceType ?? null,
        referenceId ?? null,
        description ?? null,
        createdBy ?? null,
      );
    });
  }

  async recordEscrowHold(
    supplierId: string,
    amount: number,
    poId: string,
    createdBy?: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.createEntry(
        manager,
        supplierId,
        LedgerEntryType.ESCROW_HOLD,
        -Math.abs(amount),
        'PURCHASE_ORDER',
        poId,
        `Escrow hold for PO`,
        createdBy ?? null,
      );
    });
  }

  async releaseEscrow(
    supplierId: string,
    amount: number,
    poId: string,
    createdBy?: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.createEntry(
        manager,
        supplierId,
        LedgerEntryType.ESCROW_RELEASE,
        Math.abs(amount),
        'PURCHASE_ORDER',
        poId,
        `Escrow release for PO`,
        createdBy ?? null,
      );
    });
  }

  async recordPayment(
    supplierId: string,
    amount: number,
    poId: string,
    createdBy?: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.createEntry(
        manager,
        supplierId,
        LedgerEntryType.PAYMENT,
        -Math.abs(amount),
        'PURCHASE_ORDER',
        poId,
        `Payment for PO`,
        createdBy ?? null,
      );
    });
  }

  async recordRefund(
    supplierId: string,
    amount: number,
    raId: string,
    createdBy?: string,
  ): Promise<void> {
    if (!supplierId) return; // no-op if supplier unknown
    await this.dataSource.transaction(async (manager) => {
      await this.createEntry(
        manager,
        supplierId,
        LedgerEntryType.REFUND,
        Math.abs(amount),
        'RETURN_AUTHORIZATION',
        raId,
        `Refund for return authorization`,
        createdBy ?? null,
      );
    });
  }

  async recordAdjustment(
    supplierId: string,
    amount: number,
    description: string,
    referenceType?: string,
    referenceId?: string,
    createdBy?: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.createEntry(
        manager,
        supplierId,
        LedgerEntryType.ADJUSTMENT,
        amount,
        referenceType ?? null,
        referenceId ?? null,
        description,
        createdBy ?? null,
      );
    });
  }

  // ── Query methods ─────────────────────────────────────────────────────────

  async getLedger(supplierId: string, query: QueryLedgerDto) {
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const skip = (page - 1) * limit;

    const qb = this.entryRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.creator', 'creator')
      .where('e.supplierId = :supplierId', { supplierId })
      .orderBy('e.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.dateFrom) {
      qb.andWhere('e.createdAt >= :from', { from: new Date(query.dateFrom) });
    }
    if (query.dateTo) {
      qb.andWhere('e.createdAt <= :to', { to: new Date(query.dateTo) });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getLedgerSummary(supplierId: string) {
    const result = await this.entryRepo
      .createQueryBuilder('e')
      .select('e.type', 'type')
      .addSelect('SUM(e.amount)', 'total')
      .where('e.supplierId = :supplierId', { supplierId })
      .groupBy('e.type')
      .getRawMany<{ type: string; total: string }>();

    const byType = Object.fromEntries(result.map((r) => [r.type, Number(r.total)]));

    const totalDeposits = byType['DEPOSIT'] ?? 0;
    const totalPayments = Math.abs(byType['PAYMENT'] ?? 0);
    const totalEscrowHolds = Math.abs(byType['ESCROW_HOLD'] ?? 0);
    const totalRefunds = byType['REFUND'] ?? 0;

    // Current balance = latest runningBalance
    const latest = await this.entryRepo.findOne({
      where: { supplierId },
      order: { createdAt: 'DESC' },
      select: ['runningBalance'],
    });
    const currentBalance = latest ? Number(latest.runningBalance) : 0;

    return {
      totalDeposits,
      totalPayments,
      totalEscrowHolds,
      totalRefunds,
      currentBalance,
    };
  }
}
