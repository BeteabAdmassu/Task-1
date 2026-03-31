import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllRead,
  NotificationRecord,
} from '../api/notifications';
import { getNotificationRoute } from '../utils/notification';

const POLL_INTERVAL_MS = 30_000;

export function NotificationBell() {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      setCount(await fetchUnreadCount());
    } catch {
      // network error — keep previous count
    }
  }, []);

  useEffect(() => {
    refreshCount();
    intervalRef.current = setInterval(refreshCount, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshCount]);

  // Close panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadPanel = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchNotifications({ limit: 20 });
      setNotifications(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const togglePanel = () => {
    if (!open) loadPanel();
    setOpen((v) => !v);
  };

  const handleClick = async (n: NotificationRecord) => {
    if (!n.isRead) {
      await markNotificationRead(n.id).catch(() => undefined);
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)),
      );
      setCount((c) => Math.max(0, c - 1));
    }
    const route = getNotificationRoute(n.referenceType, n.referenceId);
    if (route) {
      setOpen(false);
      navigate(route);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllRead().catch(() => undefined);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setCount(0);
  };

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      <button className="notif-bell-btn" onClick={togglePanel} aria-label="Notifications">
        <span className="notif-bell-icon">🔔</span>
        {count > 0 && (
          <span className="notif-badge">{count > 99 ? '99+' : count}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span className="notif-panel-title">Notifications</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-text notif-action" onClick={handleMarkAllRead}>
                Mark all read
              </button>
              <button
                className="btn-text notif-action"
                onClick={() => { setOpen(false); navigate('/notifications'); }}
              >
                View all
              </button>
            </div>
          </div>

          <div className="notif-panel-body">
            {loading && <p className="notif-empty">Loading…</p>}
            {!loading && notifications.length === 0 && (
              <p className="notif-empty">No notifications.</p>
            )}
            {!loading && notifications.map((n) => (
              <button
                key={n.id}
                className={`notif-item${n.isRead ? '' : ' notif-item-unread'}`}
                onClick={() => handleClick(n)}
              >
                <span className="notif-item-title">{n.title}</span>
                <span className="notif-item-message">{n.message}</span>
                <span className="notif-item-time">
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
