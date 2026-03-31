import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SystemLog } from './entities/system-log.entity';
import { JobRun } from './entities/job-run.entity';
import { ObservabilityService } from './observability.service';
import { SchedulerService } from './scheduler.service';
import { ObservabilityController } from './observability.controller';
import { DataQualityModule } from '../data-quality/data-quality.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([SystemLog, JobRun]),
    DataQualityModule,
  ],
  controllers: [ObservabilityController],
  providers: [ObservabilityService, SchedulerService],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
