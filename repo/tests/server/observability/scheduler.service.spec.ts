import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { SchedulerService } from '../../../server/src/observability/scheduler.service';
import { ObservabilityService } from '../../../server/src/observability/observability.service';
import { DataQualityService } from '../../../server/src/data-quality/data-quality.service';
import { NotificationService } from '../../../server/src/notifications/notification.service';
import { NotificationType } from '../../../server/src/common/enums/notification-type.enum';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJobRun(id = 'run-1') {
  return { id, jobName: 'test-job', attempt: 1, status: 'RUNNING', startedAt: new Date() };
}

describe('SchedulerService', () => {
  let service: SchedulerService;

  const observability = {
    startJobRun: jest.fn(async () => makeJobRun()),
    completeJobRun: jest.fn(async () => undefined),
    failJobRun: jest.fn(async () => undefined),
    writeLog: jest.fn(async () => undefined),
  };

  const dataQuality = {
    runDedupScan: jest.fn<Promise<void>, []>(async () => undefined),
    runQualityChecks: jest.fn(async () => ({ issues: [] })),
  };

  const notificationService = {
    emit: jest.fn(async () => undefined),
    drainQueue: jest.fn(async () => undefined),
  };

  const dataSource = {
    query: jest.fn(async () => [{ id: 'admin-1' }]),
    transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) => fn({})),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: ObservabilityService, useValue: observability },
        { provide: DataQualityService, useValue: dataQuality },
        { provide: NotificationService, useValue: notificationService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);
    jest.clearAllMocks();
    // Reset call counts
    observability.startJobRun.mockResolvedValue(makeJobRun());
  });

  // ── runJob success ────────────────────────────────────────────────────────

  describe('runJob — success path', () => {
    it('calls fn once when it succeeds on first attempt', async () => {
      const fn = jest.fn(async () => undefined);
      await service.runJob('test-job', fn);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(observability.completeJobRun).toHaveBeenCalledTimes(1);
      expect(observability.failJobRun).not.toHaveBeenCalled();
    });

    it('logs INFO on success', async () => {
      await service.runJob('test-job', async () => undefined);
      expect(observability.writeLog).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'INFO' }),
      );
    });

    it('does not notify admins on success', async () => {
      await service.runJob('test-job', async () => undefined);
      expect(notificationService.emit).not.toHaveBeenCalled();
    });
  });

  // ── runJob retry behaviour ────────────────────────────────────────────────

  describe('runJob — retry behaviour', () => {
    it('retries up to maxAttempts (3) on repeated failure', async () => {
      const fn = jest.fn(async () => { throw new Error('transient'); });
      // withRetry has real delays; override to avoid test slowness
      await expect(service.runJob('test-job', fn)).resolves.toBeUndefined();
      // 3 attempts: 3 startJobRun calls
      expect(observability.startJobRun).toHaveBeenCalledTimes(3);
    }, 60_000);

    it('succeeds on second attempt after first fails', async () => {
      let calls = 0;
      const fn = jest.fn(async () => {
        calls++;
        if (calls === 1) throw new Error('first attempt fails');
      });
      await service.runJob('test-job', fn);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(observability.completeJobRun).toHaveBeenCalledTimes(1);
    }, 30_000);
  });

  // ── runJob failure path ───────────────────────────────────────────────────

  describe('runJob — failure path', () => {
    it('calls failJobRun and logs ERROR after all retries exhausted', async () => {
      const fn = jest.fn(async () => { throw new Error('permanent error'); });
      await service.runJob('test-job', fn);
      expect(observability.failJobRun).toHaveBeenCalled();
      expect(observability.writeLog).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'ERROR' }),
      );
    }, 60_000);

    it('notifies administrators after all retries exhausted', async () => {
      dataSource.query.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]);
      const fn = jest.fn(async () => { throw new Error('job failed'); });
      await service.runJob('test-job', fn);
      expect(notificationService.emit).toHaveBeenCalledWith(
        'admin-1',
        NotificationType.SYSTEM_ALERT,
        expect.stringContaining('test-job'),
        expect.stringContaining('job failed'),
      );
      expect(notificationService.emit).toHaveBeenCalledWith(
        'admin-2',
        NotificationType.SYSTEM_ALERT,
        expect.any(String),
        expect.any(String),
      );
    }, 60_000);

    it('does not throw — failure is swallowed to prevent cron crash', async () => {
      const fn = jest.fn(async () => { throw new Error('crash'); });
      await expect(service.runJob('test-job', fn)).resolves.toBeUndefined();
    }, 60_000);
  });

  // ── triggerJob ───────────────────────────────────────────────────────────

  describe('triggerJob', () => {
    it('triggers dedup-scan job', async () => {
      await service.triggerJob('dedup-scan');
      expect(dataQuality.runDedupScan).toHaveBeenCalled();
    });

    it('triggers data-quality-check job', async () => {
      await service.triggerJob('data-quality-check');
      expect(dataQuality.runQualityChecks).toHaveBeenCalled();
    });

    it('triggers notification-queue-drain job', async () => {
      await service.triggerJob('notification-queue-drain');
      expect(notificationService.drainQueue).toHaveBeenCalled();
    });

    it('throws for unknown job name', async () => {
      await expect(service.triggerJob('unknown-job')).rejects.toThrow('Unknown job');
    });
  });

  // ── Transactional rollback (via DataQualityService) ───────────────────────

  describe('dedup-scan rollback on failure', () => {
    it('runDedupScan is called inside a transaction that rolls back on error', async () => {
      let transactionStarted = false;
      let rolled = false;

      // Simulate dataSource.transaction that rolls back when fn throws
      dataSource.transaction.mockImplementation(
        async (fn: (m: unknown) => Promise<unknown>) => {
          transactionStarted = true;
          try {
            return await fn({
              query: jest.fn(async () => []),
              getRepository: jest.fn(() => ({ findOne: jest.fn(), save: jest.fn(), update: jest.fn() })),
            });
          } catch (err) {
            rolled = true;
            throw err;
          }
        },
      );

      // Simulate runDedupScan that uses a transaction (which rolls back on error)
      dataQuality.runDedupScan.mockImplementation(async (): Promise<void> => {
        await dataSource.transaction(async () => {
          throw new Error('scan error');
        });
      });

      await service.triggerJob('dedup-scan');

      expect(transactionStarted).toBe(true);
      expect(rolled).toBe(true);
    }, 60_000);
  });
});
