import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { DataQualityService } from './data-quality.service';

@Controller('admin')
@Roles(Role.ADMINISTRATOR)
export class DataQualityController {
  constructor(private readonly service: DataQualityService) {}

  // ── Duplicates ─────────────────────────────────────────────────────────────

  @Get('duplicates')
  getDuplicates(
    @Query('status') status: string,
    @Query('entityType') entityType: string,
  ) {
    return this.service.getDuplicates(status, entityType);
  }

  @Get('duplicates/:id')
  getDuplicate(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getDuplicateWithDetails(id);
  }

  @Post('duplicates/:id/merge')
  @HttpCode(HttpStatus.NO_CONTENT)
  merge(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const adminId = (req.user as { id: string }).id;
    return this.service.mergeDuplicate(id, adminId);
  }

  @Post('duplicates/:id/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  dismiss(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const adminId = (req.user as { id: string }).id;
    return this.service.dismissDuplicate(id, adminId);
  }

  // ── Data quality ───────────────────────────────────────────────────────────

  @Get('data-quality/issues')
  getIssues() {
    return this.service.getLastQualityReport();
  }

  @Post('data-quality/run-check')
  @HttpCode(HttpStatus.OK)
  runCheck() {
    return this.service.runQualityChecks();
  }

  @Get('data-quality/summary')
  async getSummary() {
    const [pending, report] = await Promise.all([
      this.service.getPendingCount(),
      this.service.getLastQualityReport(),
    ]);
    return {
      pendingDuplicates: pending,
      issuesFound: report?.issues.length ?? null,
      lastCheckedAt: report?.checkedAt ?? null,
      counts: report?.counts ?? null,
    };
  }
}
