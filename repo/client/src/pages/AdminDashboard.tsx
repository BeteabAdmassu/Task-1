import { NavLink, Outlet, useLocation } from 'react-router-dom';

export function AdminDashboard() {
  const location = useLocation();
  const isRoot = location.pathname === '/admin';

  return (
    <div className="page">
      <h1>Administration</h1>
      <nav className="admin-tabs">
        <NavLink to="/admin/users" className="admin-tab">
          Users
        </NavLink>
        <NavLink to="/admin/putaway-locations" className="admin-tab">
          Putaway Locations
        </NavLink>
        <NavLink to="/admin/return-policy" className="admin-tab">
          Return Policy
        </NavLink>
        <NavLink to="/admin/synonyms" className="admin-tab">
          Search Synonyms
        </NavLink>
        <NavLink to="/admin/data-quality" className="admin-tab">
          Data Quality
        </NavLink>
        <NavLink to="/admin/observability" className="admin-tab">
          Observability
        </NavLink>
      </nav>
      {isRoot && <p className="admin-welcome">Select a section above to manage.</p>}
      <Outlet />
    </div>
  );
}
