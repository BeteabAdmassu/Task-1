import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FundsLedgerEntry } from './entities/funds-ledger-entry.entity';
import { FundsLedgerService } from './funds-ledger.service';
import { FundsLedgerController } from './funds-ledger.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([FundsLedgerEntry])],
  controllers: [FundsLedgerController],
  providers: [FundsLedgerService],
  exports: [FundsLedgerService],
})
export class FundsLedgerModule {}
