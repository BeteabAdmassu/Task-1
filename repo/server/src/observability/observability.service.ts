import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThanOrEqual, LessThanOrEqual, Between } from 'typeorm';
import { SystemLog } from './entities/system-log.entity';
import { JobRun } from './entities/job-run.entity';

export interface WriteLogInput {
  requestId?: string | null;
  userId?: string | null;
  level?: string;
  service?: string | null;
  message: string;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
}

// Cron schedule descriptions for display
const JOB_SCHEDULES: Record<string, string> = {
  'dedup-scan': 'Every 6 hours',
  'data-quality-check': 'Every 6 hours',
  'notification-queue-drain': 'Every hour',
  'session-cleanup': 'Every hour',
};

@Injectable()
export class ObservabilityService {
  constructor(
    @InjectRepository(SystemLog)
    private readonly logRepo: Repository<SystemLog>,
    @InjectRepository(JobRun)
    private readonly jobRunRepo: Repository<JobRun>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Structured logging ────────────────────────────────────────────────────

  async writeLog(input: WriteLogInput): Promise<void> {
    try {
      await this.logRepo.save({
        requestId: input.requestId ?? null,
        userId: input.userId ?? null,
        level: input.level ?? 'INFO',
        service: input.service ?? null,
        message: input.message,
        method: input.method ?? null,
        path: input.path ?? null,
        statusCode: input.statusCode ?? null,
        durationMs: input.durationMs ?? null,
        metadata: input.metadata ?? null,
      });
    } catch {
      // Never let logging errors bubble up and break the request
    }
  }

  async queryLogs(filters: {
    level?: string;
    service?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const qb = this.logRepo
      .createQueryBuilder('l')
      .orderBy('l.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (filters.level) qb.andWhere('l.level = :level', { level: filters.level });
    if (filters.service) qb.andWhere('l.service = :service', { service: filters.service });
    if (filters.from && filters.to) {
      qb.andWhere('l.createdAt BETWEEN :from AND :to', {
        from: new Date(filters.from),
        to: new Date(filters.to),
      });
    } else if (filters.from) {
      qb.andWhere('l.createdAt >= :from', { from: new Date(filters.from) });
    } else if (filters.to) {
      qb.andWhere('l.createdAt <= :to', { to: new Date(filters.to) });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  // ── Job run tracking ──────────────────────────────────────────────────────

  async startJobRun(jobName: string, attempt = 1): Promise<JobRun> {
    return this.jobRunRepo.save({
      jobName,
      status: 'RUNNING',
      attempt,
      startedAt: new Date(),
    });
  }

  async completeJobRun(id: string, durationMs: number): Promise<void> {
    await this.jobRunRepo.update(id, {
      status: 'SUCCESS',
      finishedAt: new Date(),
      durationMs,
    });
  }

  async failJobRun(id: string, durationMs: number, errorMessage: string): Promise<void> {
    await this.jobRunRepo.update(id, {
      status: 'FAILED',
      finishedAt: new Date(),
      durationMs,
      errorMessage,
    });
  }

  async getJobRun(id: string): Promise<JobRun | null> {
    return this.jobRunRepo.findOne({ where: { id } });
  }

  async getJobMetrics(): Promise<{
    jobs: Array<{
      jobName: string;
      schedule: string;
      lastRun: JobRun | null;
      successCount: number;
      failureCount: number;
    }>;
  }> {
    const jobNames = Object.keys(JOB_SCHEDULES);

    const jobs = await Promise.all(
      jobNames.map(async (jobName) => {
        const lastRun = await this.jobRunRepo.findOne({
          where: { jobName },
          order: { startedAt: 'DESC' },
        });
        const successCount = await this.jobRunRepo.count({ where: { jobName, status: 'SUCCESS' } });
        const failureCount = await this.jobRunRepo.count({ where: { jobName, status: 'FAILED' } });

        return {
          jobName,
          schedule: JOB_SCHEDULES[jobName] ?? '—',
          lastRun: lastRun ?? null,
          successCount,
          failureCount,
        };
      }),
    );

    return { jobs };
  }

  // ── Queue stats ────────────────────────────────────────────────────────────

  async getQueueStats(): Promise<{
    pendingNotifications: number;
    pendingDuplicateCandidates: number;
  }> {
    const [notifResult, dupResult] = await Promise.all([
      this.dataSource.query<Array<{ count: string }>>(
        `SELECT COUNT(*) AS count FROM notifications WHERE "isQueued" = true`,
      ),
      this.dataSource.query<Array<{ count: string }>>(
        `SELECT COUNT(*) AS count FROM duplicate_candidates WHERE status = 'PENDING_REVIEW'`,
      ),
    ]);

    return {
      pendingNotifications: parseInt(notifResult[0]?.count ?? '0', 10),
      pendingDuplicateCandidates: parseInt(dupResult[0]?.count ?? '0', 10),
    };
  }

  // ── System stats ───────────────────────────────────────────────────────────

  async getSystemStats(): Promise<{
    dbConnections: { active: number; idle: number; total: number };
    tableSizes: Array<{ table: string; sizeBytes: number; prettySize: string }>;
    uptimeSeconds: number;
  }> {
    const [connRows, sizeRows, uptimeRows] = await Promise.all([
      this.dataSource.query<Array<{ state: string; count: string }>>(`
        SELECT state, COUNT(*) AS count
        FROM pg_stat_activity
        WHERE datname = current_database()
        GROUP BY state
      `),
      this.dataSource.query<Array<{ table: string; size: string; pretty: string }>>(`
        SELECT
          relname AS table,
          pg_total_relation_size(quote_ident(relname)) AS size,
          pg_size_pretty(pg_total_relation_size(quote_ident(relname))) AS pretty
        FROM pg_stat_user_tables
        ORDER BY size DESC
        LIMIT 20
      `),
      this.dataSource.query<Array<{ uptime: string }>>(`
        SELECT EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time()))::INTEGER AS uptime
      `),
    ]);

    const connMap = new Map(connRows.map((r) => [r.state, parseInt(r.count, 10)]));
    const active = connMap.get('active') ?? 0;
    const idle = connMap.get('idle') ?? 0;

    return {
      dbConnections: { active, idle, total: active + idle },
      tableSizes: sizeRows.map((r) => ({
        table: r.table,
        sizeBytes: parseInt(r.size, 10),
        prettySize: r.pretty,
      })),
      uptimeSeconds: parseInt(uptimeRows[0]?.uptime ?? '0', 10),
    };
  }
}
