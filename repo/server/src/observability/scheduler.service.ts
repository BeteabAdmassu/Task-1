import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ObservabilityService } from './observability.service';
import { DataQualityService } from '../data-quality/data-quality.service';
import { NotificationService } from '../notifications/notification.service';
import { NotificationType } from '../common/enums/notification-type.enum';
import { withRetry } from '../common/helpers/retry.helper';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly observability: ObservabilityService,
    private readonly dataQuality: DataQualityService,
    private readonly notificationService: NotificationService,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    this.logger.log('Scheduler service initialized');
  }

  // ── Core job runner ───────────────────────────────────────────────────────

  async runJob(jobName: string, fn: () => Promise<void>): Promise<void> {
    this.logger.log(`Starting job: ${jobName}`);
    const start = Date.now();
    let runId: string | null = null;

    try {
      const { attempts } = await withRetry(async (attempt) => {
        if (attempt > 1) {
          this.logger.warn(`Retrying job ${jobName}, attempt ${attempt}`);
          // Finalize the previous attempt's run record before starting a new one,
          // so stale RUNNING rows never accumulate in the observability store.
          if (runId) {
            await this.observability.failJobRun(
              runId,
              Date.now() - start,
              `Attempt ${attempt - 1} failed, retrying`,
            );
            runId = null;
          }
        }
        runId = (await this.observability.startJobRun(jobName, attempt)).id;
        await fn();
      }, 3);

      const durationMs = Date.now() - start;
      if (runId) {
        await this.observability.completeJobRun(runId, durationMs);
      }
      this.logger.log(`Job ${jobName} completed in ${durationMs}ms (attempts: ${attempts})`);

      await this.observability.writeLog({
        level: 'INFO',
        service: 'Scheduler',
        message: `Job ${jobName} succeeded in ${durationMs}ms`,
      });
    } catch (err) {
      const durationMs = Date.now() - start;
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (runId) {
        await this.observability.failJobRun(runId, durationMs, errorMessage);
      }

      this.logger.error(`Job ${jobName} failed after all retries: ${errorMessage}`);

      await this.observability.writeLog({
        level: 'ERROR',
        service: 'Scheduler',
        message: `Job ${jobName} FAILED after all retries: ${errorMessage}`,
      });

      // Notify all administrators
      await this.notifyAdmins(jobName, errorMessage);
    }
  }

  private async notifyAdmins(jobName: string, errorMessage: string): Promise<void> {
    try {
      const admins = await this.dataSource.query<Array<{ id: string }>>(
        `SELECT id FROM users WHERE role = 'ADMINISTRATOR' AND "isActive" = true`,
      );
      for (const admin of admins) {
        await this.notificationService.emit(
          admin.id,
          NotificationType.SYSTEM_ALERT,
          `Background job failed: ${jobName}`,
          `The scheduled job "${jobName}" failed after 3 attempts. Error: ${errorMessage}`,
        );
      }
    } catch (e) {
      this.logger.error(`Failed to notify admins about job failure: ${e}`);
    }
  }

  // ── Manually trigger a job by name (used by retry endpoint) ──────────────

  async triggerJob(jobName: string): Promise<void> {
    switch (jobName) {
      case 'dedup-scan':
        return this.runJob('dedup-scan', () => this.dataQuality.runDedupScan());
      case 'data-quality-check':
        return this.runJob('data-quality-check', () =>
          this.dataQuality.runQualityChecks().then(() => undefined),
        );
      case 'notification-queue-drain':
        return this.runJob('notification-queue-drain', () =>
          this.dataSource.transaction((manager) =>
            this.notificationService.drainQueue(manager),
          ),
        );
      case 'session-cleanup':
        return this.runJob('session-cleanup', () => this.cleanExpiredSessions());
      default:
        throw new Error(`Unknown job: ${jobName}`);
    }
  }

  // ── Scheduled jobs ────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_6_HOURS)
  async scheduledDedupScan(): Promise<void> {
    await this.runJob('dedup-scan', () => this.dataQuality.runDedupScan());
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async scheduledDataQualityCheck(): Promise<void> {
    await this.runJob('data-quality-check', () =>
      this.dataQuality.runQualityChecks().then(() => undefined),
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scheduledQueueDrain(): Promise<void> {
    await this.runJob('notification-queue-drain', () =>
      this.dataSource.transaction((manager) =>
        this.notificationService.drainQueue(manager),
      ),
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scheduledSessionCleanup(): Promise<void> {
    await this.runJob('session-cleanup', () => this.cleanExpiredSessions());
  }

  private async cleanExpiredSessions(): Promise<void> {
    await this.dataSource.query(`DELETE FROM sessions WHERE "expiresAt" < now()`);
  }
}
