import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogItem } from './entities/catalog-item.entity';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { DataQualityModule } from '../data-quality/data-quality.module';

@Module({
  imports: [TypeOrmModule.forFeature([CatalogItem]), DataQualityModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
