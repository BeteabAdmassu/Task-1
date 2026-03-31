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
import { ReceivingService } from './receiving.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { QueryReceiptsDto } from './dto/query-receipts.dto';

@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly service: ReceivingService) {}

  @Get()
  @Roles(Role.WAREHOUSE_CLERK, Role.PROCUREMENT_MANAGER, Role.ADMINISTRATOR)
  findAll(@Query() query: QueryReceiptsDto) {
    return this.service.findAll(query);
  }

  @Post()
  @Roles(Role.WAREHOUSE_CLERK, Role.ADMINISTRATOR)
  create(@Body() dto: CreateReceiptDto, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.service.create(userId, dto);
  }

  @Patch(':id/complete')
  @Roles(Role.WAREHOUSE_CLERK, Role.ADMINISTRATOR)
  @HttpCode(HttpStatus.OK)
  complete(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.service.complete(id, userId);
  }
}
