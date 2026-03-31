import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';
import { getRoleRedirectPath } from '../utils/roles';

export function ChangePassword({ forced = false }: { forced?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirm) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? 'Failed to change password');
      }
      setSuccess(true);
      setTimeout(() => {
        const dest = user ? getRoleRedirectPath(user.role) : '/';
        navigate(dest, { replace: true });
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>GreenLeaf</h1>
        <h2>{forced ? 'Password Change Required' : 'Change Password'}</h2>
        {forced && (
          <p style={{ fontSize: '0.875rem', color: '#666', marginBottom: 16 }}>
            Your account requires a password change before you can continue.
          </p>
        )}

        {success ? (
          <div className="success-banner">Password changed successfully. Redirecting…</div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="login-form">
            {error && <div className="error-banner">{error}</div>}

            <label className="form-label">
              Current Password
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>

            <label className="form-label">
              New Password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>

            <label className="form-label">
              Confirm New Password
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </label>

            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Change Password'}
            </button>

            {!forced && (
              <button
                type="button"
                className="btn-text"
                style={{ marginTop: 8 }}
                onClick={() => navigate(-1)}
              >
                Cancel
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
