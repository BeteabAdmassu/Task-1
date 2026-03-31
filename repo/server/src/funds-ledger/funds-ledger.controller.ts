import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { FundsLedgerService } from './funds-ledger.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { QueryLedgerDto } from './dto/query-ledger.dto';

@Controller('suppliers/:supplierId/ledger')
export class FundsLedgerController {
  constructor(private readonly service: FundsLedgerService) {}

  @Get()
  @Roles(Role.PROCUREMENT_MANAGER, Role.ADMINISTRATOR)
  async getLedger(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Query() query: QueryLedgerDto,
  ) {
    const [entries, summary] = await Promise.all([
      this.service.getLedger(supplierId, query),
      this.service.getLedgerSummary(supplierId),
    ]);
    return { ...entries, summary };
  }

  @Post('deposit')
  @Roles(Role.ADMINISTRATOR)
  async createDeposit(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: CreateDepositDto,
    @Req() req: Request,
  ) {
    const userId = (req.user as { id: string }).id;
    await this.service.recordDeposit(
      supplierId,
      dto.amount,
      dto.referenceType,
      dto.referenceId,
      dto.description,
      userId,
    );
    return this.service.getLedgerSummary(supplierId);
  }

  @Post('adjustment')
  @Roles(Role.ADMINISTRATOR)
  async createAdjustment(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: CreateAdjustmentDto,
    @Req() req: Request,
  ) {
    const userId = (req.user as { id: string }).id;
    await this.service.recordAdjustment(
      supplierId,
      dto.amount,
      dto.description,
      dto.referenceType,
      dto.referenceId,
      userId,
    );
    return this.service.getLedgerSummary(supplierId);
  }
}
