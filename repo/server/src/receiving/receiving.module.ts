import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Receipt } from './entities/receipt.entity';
import { ReceiptLineItem } from './entities/receipt-line-item.entity';
import { PutawayLocation } from './entities/putaway-location.entity';
import { ReceivingService } from './receiving.service';
import { PutawayLocationsService } from './putaway-locations.service';
import { ReceiptsController } from './receipts.controller';
import { PutawayLocationsController, AdminPutawayLocationsController } from './putaway-locations.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Receipt, ReceiptLineItem, PutawayLocation]),
    AuditModule,
  ],
  controllers: [ReceiptsController, PutawayLocationsController, AdminPutawayLocationsController],
  providers: [ReceivingService, PutawayLocationsService],
})
export class ReceivingModule {}
