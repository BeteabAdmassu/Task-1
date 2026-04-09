import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { NotificationService } from '../../../server/src/notifications/notification.service';
import { Notification } from '../../../server/src/notifications/entities/notification.entity';
import { NotificationPreference } from '../../../server/src/notifications/entities/notification-preference.entity';
import { NotificationThrottle } from '../../../server/src/notifications/entities/notification-throttle.entity';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    recipientId: 'u1',
    type: 'SYSTEM_ALERT' as any,
    title: 'Test',
    message: 'msg',
    referenceType: null,
    referenceId: null,
    isRead: false,
    isQueued: true,
    readAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Notification;
}

/** Build a minimal mock Repository with chainable query builder. */
function makeRepo(overrides: Partial<{
  getRawManyResult: Array<{ recipientId: string }>;
  getCountResult: number;
  findResult: Notification[];
  executeResult: void;
}> = {}) {
  const executeResult = overrides.executeResult;
  const execute = jest.fn(async () => executeResult);

  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    whereInIds: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(async () => overrides.getRawManyResult ?? []),
    getCount: jest.fn(async () => overrides.getCountResult ?? 0),
    execute,
  };

  return {
    createQueryBuilder: jest.fn(() => qb),
    find: jest.fn(async () => overrides.findResult ?? []),
    save: jest.fn(async (data: unknown) => data),
    update: jest.fn(async () => undefined),
    count: jest.fn(async () => 0),
    findOne: jest.fn(async () => null),
    findOneOrFail: jest.fn(async () => null),
    _qb: qb,       // exposed for assertions
    _execute: execute,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('NotificationService — drainQueue transactional safety', () => {
  let service: NotificationService;

  // Default repos used outside of explicit manager-path tests
  let notifRepo: ReturnType<typeof makeRepo>;
  let prefRepo: ReturnType<typeof makeRepo>;
  let throttleRepo: ReturnType<typeof makeRepo>;

  const dataSource = { transaction: jest.fn() };

  beforeEach(async () => {
    notifRepo = makeRepo();
    prefRepo = makeRepo();
    throttleRepo = makeRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: getRepositoryToken(Notification), useValue: notifRepo },
        { provide: getRepositoryToken(NotificationPreference), useValue: prefRepo },
        { provide: getRepositoryToken(NotificationThrottle), useValue: throttleRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    jest.clearAllMocks();
  });

  // ── drainQueue — no-op path ───────────────────────────────────────────────

  it('does nothing when there are no queued notifications', async () => {
    notifRepo._qb.getRawMany.mockResolvedValue([]);
    await service.drainQueue();
    expect(notifRepo._execute).not.toHaveBeenCalled();
  });

  // ── drainQueue — direct repo path (no manager) ───────────────────────────

  it('delivers queued notifications via injected repo when no manager is given', async () => {
    notifRepo._qb.getRawMany.mockResolvedValue([{ recipientId: 'u1' }]);
    notifRepo._qb.getCount.mockResolvedValue(0); // 0 recent → capacity = 20
    notifRepo.find.mockResolvedValue([makeNotification({ id: 'n1' })]);

    await service.drainQueue();

    expect(notifRepo._execute).toHaveBeenCalledTimes(1);
  });

  it('respects throttle window — delivers nothing when capacity is 0', async () => {
    notifRepo._qb.getRawMany.mockResolvedValue([{ recipientId: 'u1' }]);
    notifRepo._qb.getCount.mockResolvedValue(20); // already at THROTTLE_LIMIT

    await service.drainQueue();

    expect(notifRepo._execute).not.toHaveBeenCalled();
  });

  // ── drainQueue — transactional path (with manager) ───────────────────────

  describe('with EntityManager (transactional path)', () => {
    it('uses the manager-scoped repository instead of the injected repo', async () => {
      const txRepo = makeRepo({
        getRawManyResult: [{ recipientId: 'u1' }],
        getCountResult: 0,
        findResult: [makeNotification()],
      });

      const manager = {
        getRepository: jest.fn(() => txRepo),
      } as unknown as EntityManager;

      await service.drainQueue(manager);

      // The injected repo must not be called — all IO goes through txRepo
      expect(notifRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(notifRepo.find).not.toHaveBeenCalled();
      expect(manager.getRepository).toHaveBeenCalledWith(Notification);
      expect(txRepo._execute).toHaveBeenCalledTimes(1);
    });

    it('processes multiple users within one manager scope', async () => {
      const txRepo = makeRepo({
        getRawManyResult: [{ recipientId: 'u1' }, { recipientId: 'u2' }],
        getCountResult: 0,
        findResult: [makeNotification()],
      });

      const manager = { getRepository: jest.fn(() => txRepo) } as unknown as EntityManager;

      await service.drainQueue(manager);

      // one execute() call per user
      expect(txRepo._execute).toHaveBeenCalledTimes(2);
    });
  });

  // ── Rollback simulation ───────────────────────────────────────────────────

  describe('rollback on failure (simulated via transaction mock)', () => {
    /**
     * Simulates the full transactional drain as it runs inside the scheduler:
     *   dataSource.transaction(manager => notificationService.drainQueue(manager))
     *
     * The mock transaction tracks "committed" writes.  If fn() throws the
     * mock rolls back by clearing the write log, demonstrating no partial state.
     */
    it('no writes are committed when drainQueue throws mid-execution', async () => {
      const committedWrites: string[] = [];
      let rolledBack = false;

      // Build a txRepo whose execute() records a write then throws
      const failingQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        whereInIds: jest.fn().mockReturnThis(),
        getRawMany: jest.fn(async () => [{ recipientId: 'u1' }]),
        getCount: jest.fn(async () => 0),
        execute: jest.fn(async () => {
          committedWrites.push('u1:delivered');
          throw new Error('DB failure during delivery');
        }),
      };
      const failingRepo = {
        createQueryBuilder: jest.fn(() => failingQb),
        find: jest.fn(async () => [makeNotification({ id: 'n1' })]),
      } as unknown as Repository<Notification>;

      const manager = {
        getRepository: jest.fn(() => failingRepo),
      } as unknown as EntityManager;

      // Simulate dataSource.transaction: roll back writes on error
      dataSource.transaction.mockImplementationOnce(
        async (fn: (m: EntityManager) => Promise<void>) => {
          try {
            await fn(manager);
          } catch {
            // Transaction rolled back — discard any in-progress writes
            committedWrites.length = 0;
            rolledBack = true;
            // Swallowed here so runJob can handle the error via its own catch
          }
        },
      );

      // Run as the scheduler would
      await dataSource.transaction((m: EntityManager) => service.drainQueue(m));

      expect(rolledBack).toBe(true);
      expect(committedWrites).toHaveLength(0); // no partial state persists
    });

    it('retry attempt runs a fresh transaction after rollback', async () => {
      let attemptCount = 0;

      // First attempt: fail; second attempt: succeed
      dataSource.transaction.mockImplementation(
        async (fn: (m: EntityManager) => Promise<void>) => {
          attemptCount++;
          const txRepo = makeRepo({
            getRawManyResult: [{ recipientId: 'u1' }],
            getCountResult: 0,
            findResult: [makeNotification()],
          });
          const manager = { getRepository: jest.fn(() => txRepo) } as unknown as EntityManager;

          if (attemptCount === 1) {
            try { await fn(manager); } catch { /* rolled back */ }
            throw new Error('first attempt failed');
          }
          // Second attempt succeeds
          await fn(manager);
        },
      );

      // withRetry will call the fn up to 3 times; simulate 2 attempts here
      let calls = 0;
      const drainFn = async (): Promise<void> => {
        calls++;
        await dataSource.transaction((m: EntityManager) => service.drainQueue(m));
      };

      // First call throws, second succeeds
      try { await drainFn(); } catch { /* first attempt */ }
      await drainFn(); // second attempt — should succeed

      expect(calls).toBe(2);
      expect(attemptCount).toBe(2); // two independent transactions
    });
  });
});

// ── Emit throttle boundary conditions ────────────────────────────────────────

describe('NotificationService — emit throttle boundaries', () => {
  let service: NotificationService;

  let notifRepo: ReturnType<typeof makeRepo>;
  let prefRepo: ReturnType<typeof makeRepo>;
  let throttleRepo: ReturnType<typeof makeRepo>;

  const dataSource = { transaction: jest.fn() };

  beforeEach(async () => {
    notifRepo = makeRepo();
    prefRepo = makeRepo();
    throttleRepo = makeRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: getRepositoryToken(Notification), useValue: notifRepo },
        { provide: getRepositoryToken(NotificationPreference), useValue: prefRepo },
        { provide: getRepositoryToken(NotificationThrottle), useValue: throttleRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    jest.clearAllMocks();
  });

  it('19 recent notifications — 20th emit is still delivered (not queued)', async () => {
    // Preference: not suppressed
    prefRepo.findOne.mockResolvedValue(null);
    // 19 delivered in the window → under limit
    notifRepo._qb.getCount.mockResolvedValue(19);
    // No queued to deliver
    notifRepo.find.mockResolvedValue([]);

    await service.emit('u1', 'SYSTEM_ALERT' as any, 'T', 'msg');

    // Should save with isQueued = false
    expect(notifRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ isQueued: false }),
    );
    // Should NOT log a throttle event
    expect(throttleRepo.save).not.toHaveBeenCalled();
  });

  it('20 recent notifications — 21st emit is queued', async () => {
    prefRepo.findOne.mockResolvedValue(null);
    // 20 delivered in the window → at limit
    notifRepo._qb.getCount.mockResolvedValue(20);

    await service.emit('u1', 'SYSTEM_ALERT' as any, 'T', 'msg');

    // Should save with isQueued = true
    expect(notifRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ isQueued: true }),
    );
    // Should log a throttle event
    expect(throttleRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('21+ recent notifications — further emits remain queued', async () => {
    prefRepo.findOne.mockResolvedValue(null);
    // 25 delivered in the window → well over limit
    notifRepo._qb.getCount.mockResolvedValue(25);

    await service.emit('u1', 'SYSTEM_ALERT' as any, 'T', 'msg');

    expect(notifRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ isQueued: true }),
    );
    expect(throttleRepo.save).toHaveBeenCalled();
  });

  it('when not queued, calls deliverQueued to promote any pending items', async () => {
    prefRepo.findOne.mockResolvedValue(null);
    // 18 recent → room for 2 more, emit adds 1 → 19 total → capacity = 1
    notifRepo._qb.getCount.mockResolvedValue(18);
    // One queued notification waiting
    notifRepo.find.mockResolvedValue([makeNotification({ id: 'q1', isQueued: true })]);

    await service.emit('u1', 'SYSTEM_ALERT' as any, 'T', 'msg');

    // Should save with isQueued = false (not throttled)
    expect(notifRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ isQueued: false }),
    );
    // Should promote the queued notification (execute the update query)
    expect(notifRepo._execute).toHaveBeenCalled();
  });

  it('when throttled, does NOT attempt to deliver queued items', async () => {
    prefRepo.findOne.mockResolvedValue(null);
    notifRepo._qb.getCount.mockResolvedValue(20); // at limit → queued

    await service.emit('u1', 'SYSTEM_ALERT' as any, 'T', 'msg');

    // The find() for queued items should not be called when isQueued = true
    // because deliverQueued is only called when !isQueued
    expect(notifRepo.find).not.toHaveBeenCalled();
  });
});

// ── markRead / burst behaviour ───────────────────────────────────────────────

describe('NotificationService — markRead', () => {
  let service: NotificationService;
  let notifRepo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    notifRepo = makeRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: getRepositoryToken(Notification), useValue: notifRepo },
        { provide: getRepositoryToken(NotificationPreference), useValue: makeRepo() },
        { provide: getRepositoryToken(NotificationThrottle), useValue: makeRepo() },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();
    service = module.get<NotificationService>(NotificationService);
    jest.clearAllMocks();
  });

  it('marks an unread notification as read and sets readAt', async () => {
    const notif = makeNotification({ id: 'n1', isRead: false, isQueued: false, recipientId: 'u1' });
    (notifRepo.findOne as jest.Mock).mockResolvedValue(notif);
    (notifRepo.findOneOrFail as jest.Mock).mockResolvedValue({ ...notif, isRead: true, readAt: new Date() });

    const result = await service.markRead('n1', 'u1');
    expect(notifRepo.update).toHaveBeenCalledWith('n1', expect.objectContaining({ isRead: true }));
    expect(result).toBeDefined();
  });

  it('skips update when notification is already read', async () => {
    const notif = makeNotification({ id: 'n1', isRead: true, isQueued: false, recipientId: 'u1' });
    (notifRepo.findOne as jest.Mock).mockResolvedValue(notif);
    (notifRepo.findOneOrFail as jest.Mock).mockResolvedValue(notif);

    await service.markRead('n1', 'u1');
    expect(notifRepo.update).not.toHaveBeenCalled();
  });

  it('throws when notification does not belong to user', async () => {
    (notifRepo.findOne as jest.Mock).mockResolvedValue(null);

    await expect(service.markRead('n1', 'wrong-user')).rejects.toThrow();
  });
});

// ── Scheduler integration — verify transaction wrapping ──────────────────────

describe('SchedulerService — notification-queue-drain uses transaction', () => {
  /**
   * This test ensures the scheduler calls dataSource.transaction() for the
   * drain job, not drainQueue() directly.  We import SchedulerService here
   * to keep the assertion co-located with the notification tests.
   */
  it('wraps notification-queue-drain in dataSource.transaction()', async () => {
    const { SchedulerService } = await import('../../../server/src/observability/scheduler.service');
    const { ObservabilityService } = await import('../../../server/src/observability/observability.service');
    const { DataQualityService } = await import('../../../server/src/data-quality/data-quality.service');

    const drainQueue = jest.fn<Promise<void>, [EntityManager?]>(async () => undefined);
    const transaction = jest.fn(async (fn: (m: EntityManager) => Promise<void>) => {
      await fn({} as EntityManager);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        {
          provide: ObservabilityService,
          useValue: {
            startJobRun: jest.fn(async () => ({ id: 'run-1' })),
            completeJobRun: jest.fn(async () => undefined),
            failJobRun: jest.fn(async () => undefined),
            writeLog: jest.fn(async () => undefined),
          },
        },
        {
          provide: DataQualityService,
          useValue: {
            runDedupScan: jest.fn(async () => undefined),
            runQualityChecks: jest.fn(async () => ({ issues: [] })),
          },
        },
        {
          provide: NotificationService,
          useValue: { drainQueue, emit: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: { query: jest.fn(async () => []), transaction },
        },
      ],
    }).compile();

    const scheduler = module.get<InstanceType<typeof SchedulerService>>(SchedulerService);
    await scheduler.triggerJob('notification-queue-drain');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(drainQueue).toHaveBeenCalledWith(expect.anything()); // called with the manager
  });
});
