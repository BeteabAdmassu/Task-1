import { Controller, Get, Post, Patch, Param, Body, Query, Req, ParseUUIDPipe } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { QuerySuppliersDto } from './dto/query-suppliers.dto';

function stripSensitiveFields(supplier: Record<string, unknown>, isAdmin: boolean) {
  if (!isAdmin) {
    const { bankingNotes, internalRiskFlag, budgetCap, ...safe } = supplier;
    return safe;
  }
  return supplier;
}

@Controller('suppliers')
@Roles(Role.PROCUREMENT_MANAGER, Role.ADMINISTRATOR)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  async findAll(@Query() query: QuerySuppliersDto, @Req() req: Request) {
    const result = await this.suppliersService.findAll(query);
    const isAdmin = (req.user as { role: string }).role === Role.ADMINISTRATOR;
    return {
      ...result,
      data: result.data.map((s) => stripSensitiveFields(s as unknown as Record<string, unknown>, isAdmin)),
    };
  }

  @Get('dropdown')
  async dropdown() {
    return this.suppliersService.findAllForDropdown();
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const supplier = await this.suppliersService.findById(id);
    const isAdmin = (req.user as { role: string }).role === Role.ADMINISTRATOR;
    return stripSensitiveFields(supplier as unknown as Record<string, unknown>, isAdmin);
  }

  @Post()
  async create(@Body() dto: CreateSupplierDto, @Req() req: Request) {
    const supplier = await this.suppliersService.create(dto);
    const isAdmin = (req.user as { role: string }).role === Role.ADMINISTRATOR;
    return stripSensitiveFields(supplier as unknown as Record<string, unknown>, isAdmin);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @Req() req: Request,
  ) {
    const supplier = await this.suppliersService.update(id, dto);
    const isAdmin = (req.user as { role: string }).role === Role.ADMINISTRATOR;
    return stripSensitiveFields(supplier as unknown as Record<string, unknown>, isAdmin);
  }
}
