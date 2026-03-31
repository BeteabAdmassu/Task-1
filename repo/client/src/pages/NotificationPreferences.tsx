import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchPreferences,
  updatePreferences,
  NotificationPreference,
} from '../api/notifications';
import { getNotificationTypeLabel } from '../utils/notification';

export function NotificationPreferences() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPrefs(await fetchPreferences());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (type: string) => {
    setPrefs((prev) =>
      prev.map((p) => (p.type === type ? { ...p, isEnabled: !p.isEnabled } : p)),
    );
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updatePreferences(prefs);
      setPrefs(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <button className="btn-text" onClick={() => navigate('/notifications')} style={{ marginBottom: 8 }}>
            &larr; Back to Notifications
          </button>
          <h2>Notification Preferences</h2>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {saved && <div className="info-banner">Preferences saved.</div>}

      <div className="detail-form" style={{ maxWidth: 480 }}>
        {loading && <p>Loading…</p>}
        {!loading && prefs.map((p) => (
          <div key={p.type} className="pref-row">
            <span className="pref-label">{getNotificationTypeLabel(p.type)}</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={p.isEnabled}
                onChange={() => toggle(p.type)}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        ))}

        {!loading && (
          <div className="form-actions" style={{ marginTop: 24 }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Preferences'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
