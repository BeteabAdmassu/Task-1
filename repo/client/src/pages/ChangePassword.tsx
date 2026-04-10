import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';
import { getRoleRedirectPath } from '../utils/roles';

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;

  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['', '#e53935', '#fb8c00', '#fdd835', '#43a047'];

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: i <= score ? colors[score] : '#e0e0e0',
              transition: 'background 0.2s',
            }}
          />
        ))}
      </div>
      <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: colors[score] }}>
        {labels[score]}
      </p>
    </div>
  );
}

export function ChangePassword({ forced = false }: { forced?: boolean }) {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
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
      updateUser({ mustChangePassword: false });
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
    <div className="login-container">
      <div className="login-card">
        <h1 style={{ color: '#2e7d32', marginBottom: 4 }}>GreenLeaf</h1>
        <p className="login-subtitle">
          {forced ? 'Password Change Required' : 'Change Password'}
        </p>

        {forced && (
          <div
            style={{
              background: '#fff8e1',
              border: '1px solid #ffe082',
              borderRadius: 4,
              padding: '10px 14px',
              marginBottom: 20,
              fontSize: '0.875rem',
              color: '#5d4037',
            }}
          >
            Your account requires a password change before you can continue.
          </div>
        )}

        {success ? (
          <div
            style={{
              background: '#e8f5e9',
              border: '1px solid #a5d6a7',
              borderRadius: 4,
              padding: '16px 14px',
              textAlign: 'center',
              color: '#2e7d32',
              fontWeight: 500,
            }}
          >
            Password changed successfully. Redirecting…
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)}>
            {error && <div className="login-error">{error}</div>}

            <div className="form-group">
              <label htmlFor="currentPassword">Current Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="currentPassword"
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  autoFocus
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#888',
                    fontSize: '0.8rem',
                    padding: 0,
                  }}
                >
                  {showCurrent ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="newPassword"
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#888',
                    fontSize: '0.8rem',
                    padding: 0,
                  }}
                >
                  {showNew ? 'Hide' : 'Show'}
                </button>
              </div>
              <PasswordStrength password={newPassword} />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                style={
                  confirm && newPassword !== confirm
                    ? { borderColor: '#e53935' }
                    : undefined
                }
              />
              {confirm && newPassword !== confirm && (
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#e53935' }}>
                  Passwords do not match
                </p>
              )}
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
              style={{ marginTop: 8 }}
            >
              {submitting ? 'Saving…' : 'Change Password'}
            </button>

            {!forced && (
              <button
                type="button"
                className="btn-text"
                style={{ display: 'block', margin: '12px auto 0' }}
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
