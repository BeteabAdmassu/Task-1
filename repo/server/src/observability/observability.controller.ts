import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ObservabilityService } from './observability.service';
import { SchedulerService } from './scheduler.service';
import { QueryLogsDto } from './dto/query-logs.dto';

@Controller('admin')
@Roles(Role.ADMINISTRATOR)
export class ObservabilityController {
  constructor(
    private readonly observability: ObservabilityService,
    private readonly scheduler: SchedulerService,
  ) {}

  @Get('logs')
  async getLogs(@Query() query: QueryLogsDto) {
    return this.observability.queryLogs({
      level: query.level,
      service: query.service,
      from: query.from,
      to: query.to,
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
  }

  @Get('jobs')
  async getJobs() {
    return this.observability.getJobMetrics();
  }

  @Post('jobs/:id/retry')
  async retryJob(@Param('id', ParseUUIDPipe) id: string) {
    const run = await this.observability.getJobRun(id);
    if (!run) throw new NotFoundException('Job run not found');
    // Fire and forget — the new run will be tracked in job_runs
    void this.scheduler.triggerJob(run.jobName);
    return { message: `Job "${run.jobName}" triggered for retry` };
  }

  @Get('system/stats')
  async getSystemStats() {
    const [queueStats, systemStats] = await Promise.all([
      this.observability.getQueueStats(),
      this.observability.getSystemStats(),
    ]);
    return { queues: queueStats, ...systemStats };
  }
}
