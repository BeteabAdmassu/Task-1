import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DuplicateCandidate } from './entities/duplicate-candidate.entity';
import { EntityMapping } from './entities/entity-mapping.entity';
import { DataQualityService } from './data-quality.service';
import { DataQualityController } from './data-quality.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DuplicateCandidate, EntityMapping])],
  controllers: [DataQualityController],
  providers: [DataQualityService],
  exports: [DataQualityService],
})
export class DataQualityModule {}
