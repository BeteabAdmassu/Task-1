import { NavLink, Outlet, useLocation } from 'react-router-dom';

export function PlantCareDashboard() {
  const location = useLocation();
  const isIndex = location.pathname === '/plant-care' || location.pathname === '/plant-care/';

  return (
    <div className="page">
      <h1>Plant Care</h1>

      <nav className="admin-tabs">
        <NavLink
          to="/plant-care/articles"
          className={({ isActive }) => `admin-tab${isActive ? ' active' : ''}`}
        >
          Knowledge Base
        </NavLink>
        <NavLink
          to="/plant-care/favorites"
          className={({ isActive }) => `admin-tab${isActive ? ' active' : ''}`}
        >
          My Favorites
        </NavLink>
      </nav>

      {isIndex ? (
        <p style={{ color: '#666', marginTop: 8 }}>
          Select a section above.
        </p>
      ) : (
        <Outlet />
      )}
    </div>
  );
}
