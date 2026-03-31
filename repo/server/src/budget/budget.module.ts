import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BudgetOverride } from './entities/budget-override.entity';
import { Supplier } from '../suppliers/supplier.entity';
import { BudgetService } from './budget.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BudgetOverride, Supplier]),
    AuditModule,
  ],
  providers: [BudgetService],
  exports: [BudgetService],
})
export class BudgetModule {}
