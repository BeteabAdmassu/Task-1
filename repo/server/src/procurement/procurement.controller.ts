import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ProcurementService } from './procurement.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { ApprovalActionDto } from './dto/approval-action.dto';
import { QueryRequestsDto } from './dto/query-requests.dto';
import { CreateLowStockAlertDto } from './dto/create-low-stock-alert.dto';

@Controller('procurement')
export class ProcurementController {
  constructor(private readonly procurementService: ProcurementService) {}

  @Get('requests')
  @Roles(Role.PROCUREMENT_MANAGER, Role.ADMINISTRATOR)
  async findAll(@Query() query: QueryRequestsDto) {
    return this.procurementService.findAll(query);
  }

  @Get('requests/approval-queue')
  @Roles(Role.PROCUREMENT_MANAGER, Role.ADMINISTRATOR)
  async getApprovalQueue(@Query() query: QueryRequestsDto) {
    return this.procurementService.getApprovalQueue(query);
  }

  @Get('requests/:id')
  @Roles(Role.PROCUREMENT_MANAGER, Role.ADMINISTRATOR)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.procurementService.findById(id);
  }

  @Post('requests')
  @Roles(Role.PROCUREMENT_MANAGER, Role.ADMINISTRATOR)
  async create(@Body() dto: CreateRequestDto, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.procurementService.create(dto, userId);
  }

  @Patch('requests/:id')
  @Roles(Role.PROCUREMENT_MANAGER, Role.ADMINISTRATOR)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequestDto,
    @Req() req: Request,
  ) {
    const userId = (req.user as { id: string }).id;
    return this.procurementService.update(id, dto, userId);
  }

  @Post('requests/:id/submit')
  @Roles(Role.PROCUREMENT_MANAGER, Role.ADMINISTRATOR)
  @HttpCode(HttpStatus.OK)
  async submit(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.procurementService.submit(id, userId);
  }

  @Post('requests/:id/approve')
  @Roles(Role.PROCUREMENT_MANAGER, Role.ADMINISTRATOR)
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalActionDto,
    @Req() req: Request,
  ) {
    const user = req.user as { id: string; role: Role; isSupervisor: boolean };
    return this.procurementService.processApproval(id, dto, user.id, user.role, user.isSupervisor ?? false);
  }

  @Post('requests/:id/cancel')
  @Roles(Role.PROCUREMENT_MANAGER, Role.ADMINISTRATOR)
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.procurementService.cancel(id, userId);
  }

  /**
   * POST /api/procurement/low-stock-alert
   *
   * Ingests a low-stock alert from warehouse personnel, creating and auto-submitting
   * a purchase request. Open to WAREHOUSE_CLERK, PROCUREMENT_MANAGER, and ADMINISTRATOR.
   */
  @Post('low-stock-alert')
  @Roles(Role.WAREHOUSE_CLERK, Role.PROCUREMENT_MANAGER, Role.ADMINISTRATOR)
  async ingestLowStockAlert(@Body() dto: CreateLowStockAlertDto, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.procurementService.ingestLowStockAlert(
      {
        title: dto.title,
        supplierId: dto.supplierId,
        items: dto.items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        notes: dto.notes,
      },
      userId,
    );
  }
}
