import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from './supplier.entity';
import { User } from '../users/user.entity';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { SupplierPortalController } from './supplier-portal.controller';
import { DataQualityModule } from '../data-quality/data-quality.module';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier, User]), DataQualityModule],
  controllers: [SuppliersController, SupplierPortalController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
