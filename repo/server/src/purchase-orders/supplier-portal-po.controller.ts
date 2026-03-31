import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { PurchaseOrdersService } from './purchase-orders.service';
import { User } from '../users/user.entity';
import { QueryPosDto } from './dto/query-pos.dto';

@Controller('supplier-portal/purchase-orders')
@Roles(Role.SUPPLIER)
export class SupplierPortalPoController {
  constructor(
    private readonly service: PurchaseOrdersService,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  private async getSupplierIdForUser(userId: string): Promise<string> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user?.supplierId) {
      throw new NotFoundException('No supplier profile linked to this account');
    }
    return user.supplierId;
  }

  @Get()
  async findAll(@Query() query: QueryPosDto, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    const supplierId = await this.getSupplierIdForUser(userId);
    return this.service.findForSupplier(supplierId, query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    const supplierId = await this.getSupplierIdForUser(userId);
    return this.service.findByIdForSupplier(id, supplierId);
  }
}
