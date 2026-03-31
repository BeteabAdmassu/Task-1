import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderLineItem } from './entities/purchase-order-line-item.entity';
import { User } from '../users/user.entity';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { SupplierPortalPoController } from './supplier-portal-po.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseOrder, PurchaseOrderLineItem, User]),
    AuditModule,
  ],
  controllers: [PurchaseOrdersController, SupplierPortalPoController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
