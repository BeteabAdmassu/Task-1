import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, DataSource } from 'typeorm';
import { BudgetOverride } from './entities/budget-override.entity';
import { Supplier } from '../suppliers/supplier.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../common/enums/audit-action.enum';

export interface BudgetCheckResult {
  allowed: boolean;
  cap: number | null;
  committed: number;
  available: number | null;
}

@Injectable()
export class BudgetService {
  constructor(
    @InjectRepository(BudgetOverride)
    private readonly overrideRepo: Repository<BudgetOverride>,
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Calculates the currently committed amount for a supplier:
   * the sum of totalAmount across POs in ISSUED, PARTIALLY_RECEIVED, or FULLY_RECEIVED status.
   * Must be called inside an open transaction to benefit from advisory-lock serialization.
   */
  async getCommittedAmount(manager: EntityManager, supplierId: string): Promise<number> {
    const result = await manager.query<{ committed: string }[]>(
      `SELECT COALESCE(SUM("totalAmount"), 0) AS committed
       FROM purchase_orders
       WHERE "supplierId" = $1
         AND status IN ('ISSUED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED')`,
      [supplierId],
    );
    return Number(result[0].committed);
  }

  /**
   * Checks whether issuing a PO of `poAmount` for `supplierId` would breach the budget cap.
   *
   * - If the supplier has no `budgetCap`, always returns `{ allowed: true }`.
   * - Uses `pg_advisory_xact_lock` to prevent concurrent over-commit within the same
   *   transaction that will issue the PO.  Must be called from within an active transaction.
   */
  async checkAndEnforce(
    manager: EntityManager,
    supplierId: string,
    poAmount: number,
  ): Promise<BudgetCheckResult> {
    const supplier = await manager.findOne(Supplier, {
      where: { id: supplierId },
      select: ['id', 'budgetCap'],
    });

    if (!supplier || supplier.budgetCap === null || supplier.budgetCap === undefined) {
      return { allowed: true, cap: null, committed: 0, available: null };
    }

    // Serialize concurrent issue requests for this supplier's budget slot
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `budget-${supplierId}`,
    ]);

    const committed = await this.getCommittedAmount(manager, supplierId);
    const cap = Number(supplier.budgetCap);
    const available = parseFloat((cap - committed).toFixed(2));

    return {
      allowed: poAmount <= available,
      cap,
      committed,
      available,
    };
  }

  /**
   * Records an authorized budget-cap override and writes an audit log entry.
   * Must be called from within the same transaction that issues the PO.
   */
  async recordOverride(
    manager: EntityManager,
    poId: string,
    supplierId: string,
    authorizedBy: string,
    poAmount: number,
    availableAtTime: number,
    reason: string,
  ): Promise<void> {
    const override = manager.create(BudgetOverride, {
      poId,
      supplierId,
      authorizedBy,
      overrideAmount: poAmount,
      availableAtTime,
      reason,
    });
    await manager.save(BudgetOverride, override);

    await this.auditService.log(
      authorizedBy,
      AuditAction.BUDGET_OVERRIDE,
      'PurchaseOrder',
      poId,
      {
        supplierId,
        poAmount,
        availableAtTime,
        shortfall: parseFloat((poAmount - availableAtTime).toFixed(2)),
        reason,
      },
    );
  }

  /**
   * Returns the current budget status for a supplier without acquiring a lock.
   * Safe to call outside a transaction for read-only display purposes.
   */
  async getBudgetStatus(supplierId: string): Promise<BudgetCheckResult> {
    const supplier = await this.supplierRepo.findOne({
      where: { id: supplierId },
      select: ['id', 'budgetCap'],
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    if (supplier.budgetCap === null || supplier.budgetCap === undefined) {
      return { allowed: true, cap: null, committed: 0, available: null };
    }

    const result = await this.dataSource.query<{ committed: string }[]>(
      `SELECT COALESCE(SUM("totalAmount"), 0) AS committed
       FROM purchase_orders
       WHERE "supplierId" = $1
         AND status IN ('ISSUED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED')`,
      [supplierId],
    );
    const committed = Number(result[0].committed);
    const cap = Number(supplier.budgetCap);
    const available = parseFloat((cap - committed).toFixed(2));

    return { allowed: committed < cap, cap, committed, available };
  }
}
