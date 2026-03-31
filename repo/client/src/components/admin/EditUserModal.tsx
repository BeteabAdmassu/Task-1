import { useState, FormEvent } from 'react';
import { UserRecord } from '../../api/admin';
import { getRoleDisplayName } from '../../utils/roles';

const ROLES = [
  'PROCUREMENT_MANAGER',
  'WAREHOUSE_CLERK',
  'PLANT_CARE_SPECIALIST',
  'ADMINISTRATOR',
  'SUPPLIER',
];

interface Props {
  user: UserRecord;
  onClose: () => void;
  onSubmit: (id: string, payload: { role?: string; isActive?: boolean }) => Promise<void>;
}

export function EditUserModal({ user, onClose, onSubmit }: Props) {
  const [role, setRole] = useState(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload: { role?: string; isActive?: boolean } = {};
    if (role !== user.role) payload.role = role;
    if (isActive !== user.isActive) payload.isActive = isActive;

    try {
      await onSubmit(user.id, payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit User: {user.username}</h2>
        <form onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="edit-role">Role</label>
            <select
              id="edit-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {getRoleDisplayName(r)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
