import {
  Controller,
  Get,
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
import { PurchaseOrdersService } from './purchase-orders.service';
import { QueryPosDto } from './dto/query-pos.dto';
import { UpdatePoDto } from './dto/update-po.dto';

@Controller('purchase-orders')
@Roles(Role.PROCUREMENT_MANAGER, Role.ADMINISTRATOR)
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Get()
  findAll(@Query() query: QueryPosDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePoDto,
  ) {
    return this.service.update(id, dto);
  }

  @Patch(':id/issue')
  @HttpCode(HttpStatus.OK)
  issue(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.service.issue(id, userId);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.service.cancel(id, userId);
  }
}
