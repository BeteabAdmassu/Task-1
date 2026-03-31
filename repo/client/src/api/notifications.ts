import { apiFetch } from './auth';

export interface NotificationRecord {
  id: string;
  recipientId: string;
  type: string;
  title: string;
  message: string;
  referenceType: string | null;
  referenceId: string | null;
  isRead: boolean;
  readAt: string | null;
  isQueued: boolean;
  createdAt: string;
}

export interface PaginatedNotifications {
  data: NotificationRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface NotificationPreference {
  type: string;
  isEnabled: boolean;
}

// ── Notifications ──────────────────────────────────────────────────────────

export async function fetchNotifications(params: {
  unreadOnly?: boolean;
  page?: number;
  limit?: number;
} = {}): Promise<PaginatedNotifications> {
  const query = new URLSearchParams();
  if (params.unreadOnly) query.set('unreadOnly', 'true');
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  const res = await apiFetch(`/notifications?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await apiFetch('/notifications/unread-count');
  if (!res.ok) return 0;
  const { count } = await res.json();
  return count;
}

export async function markNotificationRead(id: string): Promise<NotificationRecord> {
  const res = await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to mark as read');
  return res.json();
}

export async function markAllRead(): Promise<void> {
  await apiFetch('/notifications/read-all', { method: 'PATCH' });
}

// ── Preferences ────────────────────────────────────────────────────────────

export async function fetchPreferences(): Promise<NotificationPreference[]> {
  const res = await apiFetch('/notifications/preferences');
  if (!res.ok) throw new Error('Failed to fetch preferences');
  return res.json();
}

export async function updatePreferences(
  preferences: NotificationPreference[],
): Promise<NotificationPreference[]> {
  const res = await apiFetch('/notifications/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ preferences }),
  });
  if (!res.ok) throw new Error('Failed to update preferences');
  return res.json();
}
