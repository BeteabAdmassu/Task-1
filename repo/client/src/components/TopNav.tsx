import { useAuth } from '../contexts/AuthContext';
import { getRoleDisplayName } from '../utils/roles';
import { NotificationBell } from './NotificationBell';

export function TopNav() {
  const { user, logout } = useAuth();

  return (
    <header className="top-nav">
      <div className="top-nav-brand">GreenLeaf Operations Suite</div>
      <div className="top-nav-actions">
        {user && (
          <>
            <NotificationBell />
            <span className="top-nav-user">
              {user.username} ({getRoleDisplayName(user.role)})
            </span>
            <button className="btn-logout" onClick={logout}>
              Sign Out
            </button>
          </>
        )}
      </div>
    </header>
  );
}
