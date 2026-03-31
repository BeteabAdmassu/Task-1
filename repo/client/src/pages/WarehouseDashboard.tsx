import { NavLink, Outlet, useLocation } from 'react-router-dom';

export function WarehouseDashboard() {
  const location = useLocation();
  const isIndex = location.pathname === '/warehouse';

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h2>Warehouse</h2>
      </div>
      <div className="sub-nav">
        <NavLink to="/warehouse/receive" className={({ isActive }) => isActive ? 'sub-nav-link active' : 'sub-nav-link'}>
          Receive Goods
        </NavLink>
        <NavLink to="/warehouse/receipts" className={({ isActive }) => isActive ? 'sub-nav-link active' : 'sub-nav-link'}>
          Receipts
        </NavLink>
      </div>
      {isIndex ? (
        <div className="page">
          <p>Select an option above to begin.</p>
        </div>
      ) : (
        <Outlet />
      )}
    </div>
  );
}
