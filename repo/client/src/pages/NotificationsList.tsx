import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchNotifications,
  markNotificationRead,
  markAllRead,
  PaginatedNotifications,
} from '../api/notifications';
import { getNotificationRoute } from '../utils/notification';

export function NotificationsList() {
  const navigate = useNavigate();
  const [data, setData] = useState<PaginatedNotifications | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Track connectivity changes reactively
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchNotifications({ unreadOnly, page, limit: 30 }));
    } catch (err) {
      if (!navigator.onLine) {
        setIsOffline(true);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load');
      }
    } finally {
      setLoading(false);
    }
  }, [unreadOnly, page]);

  useEffect(() => { load(); }, [load]);

  const handleClick = async (id: string, referenceType: string | null, referenceId: string | null, isRead: boolean) => {
    if (!isRead) {
      await markNotificationRead(id).catch(() => undefined);
      setData((prev) =>
        prev
          ? {
              ...prev,
              data: prev.data.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
            }
          : null,
      );
    }
    const route = getNotificationRoute(referenceType, referenceId);
    if (route) navigate(route);
  };

  const handleMarkAll = async () => {
    await markAllRead();
    load();
  };

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2>Notifications</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary btn-sm" onClick={handleMarkAll}>
            Mark All as Read
          </button>
          <button
            className="btn-outline btn-sm"
            onClick={() => navigate('/notifications/preferences')}
          >
            Preferences
          </button>
        </div>
      </div>

      <div className="filters-row" style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }}
          />
          Unread only
        </label>
      </div>

      {isOffline && (
        <div className="offline-banner" role="status">
          You are offline — notifications may not reflect the latest activity.
          Connect to the network and refresh to see up-to-date notifications.
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      <div className="notif-full-list">
        {loading && <p className="table-empty">Loading…</p>}
        {!loading && data?.data.length === 0 && (
          <p className="table-empty">No notifications.</p>
        )}
        {!loading && data?.data.map((n) => {
          const route = getNotificationRoute(n.referenceType, n.referenceId);
          return (
            <button
              key={n.id}
              className={`notif-full-item${n.isRead ? '' : ' notif-item-unread'}`}
              onClick={() => handleClick(n.id, n.referenceType, n.referenceId, n.isRead)}
              style={{ cursor: route ? 'pointer' : 'default' }}
            >
              <div className="notif-full-item-left">
                {!n.isRead && <span className="notif-dot" />}
                <div>
                  <span className="notif-item-title">{n.title}</span>
                  <span className="notif-item-message">{n.message}</span>
                </div>
              </div>
              <span className="notif-item-time">{new Date(n.createdAt).toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      {data && data.meta.totalPages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-text">
            Previous
          </button>
          <span>Page {data.meta.page} of {data.meta.totalPages}</span>
          <button
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-text"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
