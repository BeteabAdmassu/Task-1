import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function Sidebar() {
  const { user } = useAuth();
  const role = user?.role;

  return (
    <aside className="sidebar">
      <nav>
        <ul>
          {(role === 'PROCUREMENT_MANAGER' || role === 'ADMINISTRATOR') && (
            <>
              <li>
                <NavLink to="/procurement">Procurement</NavLink>
              </li>
              <li>
                <NavLink to="/procurement/requests">Requests</NavLink>
              </li>
              <li>
                <NavLink to="/procurement/approvals">Approvals</NavLink>
              </li>
              <li>
                <NavLink to="/procurement/suppliers">Suppliers</NavLink>
              </li>
              <li>
                <NavLink to="/procurement/purchase-orders">Purchase Orders</NavLink>
              </li>
              <li>
                <NavLink to="/procurement/returns">Returns</NavLink>
              </li>
            </>
          )}
          {(role === 'WAREHOUSE_CLERK' || role === 'ADMINISTRATOR') && (
            <>
              <li>
                <NavLink to="/warehouse">Warehouse</NavLink>
              </li>
              <li>
                <NavLink to="/warehouse/receive">Receive Goods</NavLink>
              </li>
              <li>
                <NavLink to="/warehouse/receipts">Receipts</NavLink>
              </li>
            </>
          )}
          {(role === 'PLANT_CARE_SPECIALIST' || role === 'ADMINISTRATOR' || role === 'WAREHOUSE_CLERK' || role === 'PROCUREMENT_MANAGER') && (
            <>
              <li>
                <NavLink to="/plant-care">Plant Care</NavLink>
              </li>
              <li>
                <NavLink to="/plant-care/articles">Knowledge Base</NavLink>
              </li>
              <li>
                <NavLink to="/plant-care/favorites">My Favorites</NavLink>
              </li>
            </>
          )}
          {role === 'ADMINISTRATOR' && (
            <>
              <li>
                <NavLink to="/admin">Administration</NavLink>
              </li>
              <li>
                <NavLink to="/admin/users">User Management</NavLink>
              </li>
              <li>
                <NavLink to="/admin/putaway-locations">Putaway Locations</NavLink>
              </li>
              <li>
                <NavLink to="/admin/return-policy">Return Policy</NavLink>
              </li>
              <li>
                <NavLink to="/admin/synonyms">Search Synonyms</NavLink>
              </li>
              <li>
                <NavLink to="/admin/data-quality">Data Quality</NavLink>
              </li>
              <li>
                <NavLink to="/admin/observability">Observability</NavLink>
              </li>
            </>
          )}
          <li>
            <NavLink to="/notifications">Notifications</NavLink>
          </li>
          {(role === 'SUPPLIER' || role === 'ADMINISTRATOR') && (
            <li>
              <NavLink to="/supplier-portal">Supplier Portal</NavLink>
            </li>
          )}
        </ul>
      </nav>
    </aside>
  );
}
