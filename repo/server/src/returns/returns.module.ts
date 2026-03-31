import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReturnAuthorization } from './entities/return-authorization.entity';
import { ReturnLineItem } from './entities/return-line-item.entity';
import { ReturnPolicy } from './entities/return-policy.entity';
import { Receipt } from '../receiving/entities/receipt.entity';
import { ReceiptLineItem } from '../receiving/entities/receipt-line-item.entity';
import { User } from '../users/user.entity';
import { ReturnsService } from './returns.service';
import { ReturnsController } from './returns.controller';
import { SupplierPortalReturnsController } from './supplier-portal-returns.controller';
import { ReturnPolicyController } from './return-policy.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReturnAuthorization,
      ReturnLineItem,
      ReturnPolicy,
      Receipt,
      ReceiptLineItem,
      User,
    ]),
    AuditModule,
  ],
  controllers: [ReturnsController, SupplierPortalReturnsController, ReturnPolicyController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
