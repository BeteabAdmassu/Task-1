import { Controller, Get, Req, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SuppliersService } from './suppliers.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';

@Controller('supplier-portal')
@Roles(Role.SUPPLIER)
export class SupplierPortalController {
  constructor(
    private readonly suppliersService: SuppliersService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  @Get('profile')
  async getProfile(@Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['supplier'],
    });

    if (!user?.supplierId) {
      throw new NotFoundException('No supplier profile linked to this account');
    }

    const supplier = await this.suppliersService.findById(user.supplierId);

    // Return only safe fields for supplier portal
    return {
      id: supplier.id,
      name: supplier.name,
      contactName: supplier.contactName,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      paymentTerms: supplier.paymentTerms,
      customTermsDescription: supplier.customTermsDescription,
      isActive: supplier.isActive,
    };
  }
}
