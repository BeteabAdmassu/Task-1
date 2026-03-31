import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationThrottle } from './entities/notification-throttle.entity';
import { NotificationType } from '../common/enums/notification-type.enum';

const THROTTLE_LIMIT = 20;
const THROTTLE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export interface NotificationReference {
  type: string;
  id: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private readonly prefRepo: Repository<NotificationPreference>,
    @InjectRepository(NotificationThrottle)
    private readonly throttleRepo: Repository<NotificationThrottle>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Emit ──────────────────────────────────────────────────────────────────

  async emit(
    recipientId: string,
    type: NotificationType,
    title: string,
    message: string,
    reference?: NotificationReference,
  ): Promise<void> {
    // 1. Check preference (user may have disabled this type)
    const pref = await this.prefRepo.findOne({ where: { userId: recipientId, type } });
    if (pref && !pref.isEnabled) {
      this.logger.debug(`Notification suppressed by preference: ${type} → ${recipientId}`);
      return;
    }

    // 2. Count delivered notifications in rolling 60-minute window
    const windowStart = new Date(Date.now() - THROTTLE_WINDOW_MS);
    const recentCount = await this.notifRepo
      .createQueryBuilder('n')
      .where('n.recipientId = :recipientId', { recipientId })
      .andWhere('n.isQueued = false')
      .andWhere('n.createdAt >= :windowStart', { windowStart })
      .getCount();

    let isQueued = false;
    if (recentCount >= THROTTLE_LIMIT) {
      isQueued = true;
      // Log throttle event
      await this.throttleRepo.save({ userId: recipientId, type });
      this.logger.warn(
        `Throttled notification for user ${recipientId}: type=${type}, recentCount=${recentCount}`,
      );
    }

    // 3. Save notification
    await this.notifRepo.save({
      recipientId,
      type,
      title,
      message,
      referenceType: reference?.type ?? null,
      referenceId: reference?.id ?? null,
      isRead: false,
      isQueued,
    });

    // 4. If not throttled, deliver any queued notifications that fit in the new window
    if (!isQueued) {
      await this.deliverQueued(recipientId, recentCount + 1);
    }
  }

  // Drain all queued notifications for all users (used by scheduler)
  async drainQueue(): Promise<void> {
    const users: Array<{ recipientId: string }> = await this.notifRepo
      .createQueryBuilder('n')
      .select('DISTINCT n.recipientId', 'recipientId')
      .where('n.isQueued = true')
      .getRawMany();

    for (const { recipientId } of users) {
      const windowStart = new Date(Date.now() - THROTTLE_WINDOW_MS);
      const currentCount = await this.notifRepo
        .createQueryBuilder('n')
        .where('n.recipientId = :recipientId', { recipientId })
        .andWhere('n.isQueued = false')
        .andWhere('n.createdAt >= :windowStart', { windowStart })
        .getCount();

      await this.deliverQueued(recipientId, currentCount);
    }
  }

  // Promote oldest queued notifications up to available capacity
  private async deliverQueued(recipientId: string, currentCount: number): Promise<void> {
    const capacity = THROTTLE_LIMIT - currentCount;
    if (capacity <= 0) return;

    const queued = await this.notifRepo.find({
      where: { recipientId, isQueued: true },
      order: { createdAt: 'ASC' },
      take: capacity,
    });

    if (queued.length === 0) return;

    await this.notifRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ isQueued: false })
      .whereInIds(queued.map((n) => n.id))
      .execute();

    this.logger.log(`Delivered ${queued.length} queued notification(s) for user ${recipientId}`);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async findForUser(
    userId: string,
    opts: { unreadOnly?: boolean; page?: number; limit?: number },
  ) {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.notifRepo
      .createQueryBuilder('n')
      .where('n.recipientId = :userId', { userId })
      .andWhere('n.isQueued = false')
      .orderBy('n.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (opts.unreadOnly) {
      qb.andWhere('n.isRead = false');
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notifRepo.count({
      where: { recipientId: userId, isRead: false, isQueued: false },
    });
  }

  async markRead(id: string, userId: string): Promise<Notification> {
    const n = await this.notifRepo.findOne({ where: { id, recipientId: userId } });
    if (!n) throw new Error('Notification not found');
    if (!n.isRead) {
      await this.notifRepo.update(id, { isRead: true, readAt: new Date() });
    }
    return this.notifRepo.findOneOrFail({ where: { id } });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true, readAt: new Date() })
      .where('"recipientId" = :userId', { userId })
      .andWhere('"isRead" = false')
      .execute();
  }

  // ── Preferences ───────────────────────────────────────────────────────────

  async getPreferences(userId: string): Promise<Array<{ type: NotificationType; isEnabled: boolean }>> {
    const saved = await this.prefRepo.find({ where: { userId } });
    const savedMap = new Map(saved.map((p) => [p.type, p.isEnabled]));

    return Object.values(NotificationType).map((type) => ({
      type,
      isEnabled: savedMap.has(type) ? (savedMap.get(type) as boolean) : true,
    }));
  }

  async updatePreferences(
    userId: string,
    updates: Array<{ type: NotificationType; isEnabled: boolean }>,
  ): Promise<Array<{ type: NotificationType; isEnabled: boolean }>> {
    for (const upd of updates) {
      await this.prefRepo
        .createQueryBuilder()
        .insert()
        .into(NotificationPreference)
        .values({ userId, type: upd.type, isEnabled: upd.isEnabled })
        .orUpdate(['isEnabled'], ['userId', 'type'])
        .execute();
    }
    return this.getPreferences(userId);
  }
}
