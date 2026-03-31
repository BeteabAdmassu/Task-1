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
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { QueryReturnsDto } from './dto/query-returns.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';

@Controller('returns')
@Roles(Role.PROCUREMENT_MANAGER, Role.ADMINISTRATOR)
export class ReturnsController {
  constructor(private readonly service: ReturnsService) {}

  @Get()
  findAll(@Query() query: QueryReturnsDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Post()
  create(@Body() dto: CreateReturnDto, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.service.create(userId, dto);
  }

  @Patch(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.service.submit(id, userId);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReturnStatusDto,
    @Req() req: Request,
  ) {
    const userId = (req.user as { id: string }).id;
    return this.service.updateStatus(id, userId, dto.status);
  }
}
