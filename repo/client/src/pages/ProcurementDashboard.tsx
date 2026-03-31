import { NavLink, Outlet, useLocation } from 'react-router-dom';

export function ProcurementDashboard() {
  const location = useLocation();
  const isRoot = location.pathname === '/procurement';

  return (
    <div className="page">
      <h1>Procurement</h1>
      <nav className="admin-tabs">
        <NavLink to="/procurement/requests" className="admin-tab">
          Requests
        </NavLink>
        <NavLink to="/procurement/approvals" className="admin-tab">
          Approval Queue
        </NavLink>
        <NavLink to="/procurement/suppliers" className="admin-tab">
          Suppliers
        </NavLink>
        <NavLink to="/procurement/purchase-orders" className="admin-tab">
          Purchase Orders
        </NavLink>
        <NavLink to="/procurement/returns" className="admin-tab">
          Returns
        </NavLink>
      </nav>
      {isRoot && <p className="admin-welcome">Select a section above to manage.</p>}
      <Outlet />
    </div>
  );
}
