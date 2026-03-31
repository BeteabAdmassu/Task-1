import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { ProcurementDashboard } from './pages/ProcurementDashboard';
import { SupplierList } from './pages/SupplierList';
import { SupplierDetail } from './pages/SupplierDetail';
import { RequestList } from './pages/RequestList';
import { RequestForm } from './pages/RequestForm';
import { ApprovalQueue } from './pages/ApprovalQueue';
import { WarehouseDashboard } from './pages/WarehouseDashboard';
import { PlantCareDashboard } from './pages/PlantCareDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminUsers } from './pages/AdminUsers';
import { SupplierPortal } from './pages/SupplierPortal';
import { PoList } from './pages/PoList';
import { PoDetail } from './pages/PoDetail';
import { SupplierPortalPoDetail } from './pages/SupplierPortalPoDetail';
import { ReceivingForm } from './pages/ReceivingForm';
import { ReceiptList } from './pages/ReceiptList';
import { PutawayLocations } from './pages/PutawayLocations';
import { ReturnList } from './pages/ReturnList';
import { ReturnForm } from './pages/ReturnForm';
import { ReturnDetail } from './pages/ReturnDetail';
import { ReturnPolicy } from './pages/ReturnPolicy';
import { SupplierPortalReturnDetail } from './pages/SupplierPortalReturnDetail';
import { SupplierLedger } from './pages/SupplierLedger';
import { ArticleList } from './pages/ArticleList';
import { ArticleDetail } from './pages/ArticleDetail';
import { ArticleEditor } from './pages/ArticleEditor';
import { FavoritesList } from './pages/FavoritesList';
import { SearchResults } from './pages/SearchResults';
import { SynonymManager } from './pages/SynonymManager';
import { NotificationsList } from './pages/NotificationsList';
import { NotificationPreferences } from './pages/NotificationPreferences';
import { DataQualityDashboard } from './pages/DataQualityDashboard';
import { DuplicateReview } from './pages/DuplicateReview';
import { ObservabilityDashboard } from './pages/ObservabilityDashboard';
import { Unauthorized } from './pages/Unauthorized';
import { ChangePassword } from './pages/ChangePassword';
import { useAuth } from './contexts/AuthContext';
import { getRoleRedirectPath } from './utils/roles';
import { CHANGE_PASSWORD_PATH } from './utils/routes';

function RoleRedirect() {
  const { user } = useAuth();
  if (user) {
    if (user.mustChangePassword) {
      return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
    }
    return <Navigate to={getRoleRedirectPath(user.role)} replace />;
  }
  return <Dashboard />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route
        path={CHANGE_PASSWORD_PATH}
        element={
          <ProtectedRoute>
            <ChangePassword forced />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<RoleRedirect />} />
        <Route path="notifications" element={<NotificationsList />} />
        <Route path="notifications/preferences" element={<NotificationPreferences />} />
        <Route
          path="procurement"
          element={
            <ProtectedRoute roles={['PROCUREMENT_MANAGER', 'ADMINISTRATOR']}>
              <ProcurementDashboard />
            </ProtectedRoute>
          }
        >
          <Route path="requests" element={<RequestList />} />
          <Route path="requests/:id" element={<RequestForm />} />
          <Route path="approvals" element={<ApprovalQueue />} />
          <Route path="suppliers" element={<SupplierList />} />
          <Route path="suppliers/:id" element={<SupplierDetail />} />
          <Route path="suppliers/:id/ledger" element={<SupplierLedger />} />
          <Route path="purchase-orders" element={<PoList />} />
          <Route path="purchase-orders/:id" element={<PoDetail />} />
          <Route path="returns" element={<ReturnList />} />
          <Route path="returns/new" element={<ReturnForm />} />
          <Route path="returns/:id" element={<ReturnDetail />} />
        </Route>
        <Route
          path="warehouse"
          element={
            <ProtectedRoute roles={['WAREHOUSE_CLERK', 'ADMINISTRATOR']}>
              <WarehouseDashboard />
            </ProtectedRoute>
          }
        >
          <Route path="receive" element={<ReceivingForm />} />
          <Route path="receipts" element={<ReceiptList />} />
        </Route>
        <Route
          path="plant-care"
          element={
            <ProtectedRoute roles={['PLANT_CARE_SPECIALIST', 'ADMINISTRATOR', 'WAREHOUSE_CLERK', 'PROCUREMENT_MANAGER']}>
              <PlantCareDashboard />
            </ProtectedRoute>
          }
        >
          <Route path="articles" element={<ArticleList />} />
          <Route
            path="articles/new"
            element={
              <ProtectedRoute roles={['ADMINISTRATOR']}>
                <ArticleEditor />
              </ProtectedRoute>
            }
          />
          <Route path="articles/:id" element={<ArticleDetail />} />
          <Route
            path="articles/:id/edit"
            element={
              <ProtectedRoute roles={['ADMINISTRATOR']}>
                <ArticleEditor />
              </ProtectedRoute>
            }
          />
          <Route path="favorites" element={<FavoritesList />} />
          <Route path="search" element={<SearchResults />} />
        </Route>
        <Route
          path="admin"
          element={
            <ProtectedRoute roles={['ADMINISTRATOR']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        >
          <Route path="users" element={<AdminUsers />} />
          <Route path="putaway-locations" element={<PutawayLocations />} />
          <Route path="return-policy" element={<ReturnPolicy />} />
          <Route path="synonyms" element={<SynonymManager />} />
          <Route path="data-quality" element={<DataQualityDashboard />} />
          <Route path="duplicates/:id" element={<DuplicateReview />} />
          <Route path="observability" element={<ObservabilityDashboard />} />
        </Route>
        <Route
          path="supplier-portal"
          element={
            <ProtectedRoute roles={['SUPPLIER']}>
              <SupplierPortal />
            </ProtectedRoute>
          }
        />
        <Route
          path="supplier-portal/purchase-orders/:id"
          element={
            <ProtectedRoute roles={['SUPPLIER']}>
              <SupplierPortalPoDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="supplier-portal/returns/:id"
          element={
            <ProtectedRoute roles={['SUPPLIER']}>
              <SupplierPortalReturnDetail />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
}
