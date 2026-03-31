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

@Controller('procurement')
@Roles(Role.PROCUREMENT_MANAGER, Role.ADMINISTRATOR)
export class ProcurementController {
  constructor(private readonly procurementService: ProcurementService) {}

  @Get('requests')
  async findAll(@Query() query: QueryRequestsDto) {
    return this.procurementService.findAll(query);
  }

  @Get('requests/approval-queue')
  async getApprovalQueue(@Query() query: QueryRequestsDto) {
    return this.procurementService.getApprovalQueue(query);
  }

  @Get('requests/:id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.procurementService.findById(id);
  }

  @Post('requests')
  async create(@Body() dto: CreateRequestDto, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.procurementService.create(dto, userId);
  }

  @Patch('requests/:id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequestDto,
    @Req() req: Request,
  ) {
    const userId = (req.user as { id: string }).id;
    return this.procurementService.update(id, dto, userId);
  }

  @Post('requests/:id/submit')
  @HttpCode(HttpStatus.OK)
  async submit(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.procurementService.submit(id, userId);
  }

  @Post('requests/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalActionDto,
    @Req() req: Request,
  ) {
    const approverId = (req.user as { id: string }).id;
    return this.procurementService.processApproval(id, dto, approverId);
  }

  @Post('requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.procurementService.cancel(id, userId);
  }
}
