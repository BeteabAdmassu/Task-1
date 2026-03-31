import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseRequest } from './entities/purchase-request.entity';
import { PurchaseRequestLineItem } from './entities/purchase-request-line-item.entity';
import { Approval } from './entities/approval.entity';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { AuditModule } from '../audit/audit.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseRequest, PurchaseRequestLineItem, Approval]),
    AuditModule,
    forwardRef(() => PurchaseOrdersModule),
  ],
  controllers: [ProcurementController],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
