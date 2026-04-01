/**
 * Verifies that all three supplier-portal routes enforce the SUPPLIER-only
 * policy that matches the backend @Roles(Role.SUPPLIER) guards.
 *
 * After the role-policy fix, ADMINISTRATOR is no longer allowed into the
 * supplier portal; only SUPPLIER role may access it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';

// ── Mock AuthContext ──────────────────────────────────────────────────────────

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../contexts/AuthContext';
const mockUseAuth = vi.mocked(useAuth);

// ── Stub pages ────────────────────────────────────────────────────────────────

function SupplierPortalPage() {
  return <div>Supplier Portal Content</div>;
}
function PoDetailPage() {
  return <div>PO Detail</div>;
}
function ReturnDetailPage() {
  return <div>Return Detail</div>;
}
function UnauthorizedPage() {
  return <div>Unauthorized</div>;
}

// ── Render helper mirroring App.tsx supplier-portal routes ────────────────────

function renderPortalRoutes(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login</div>} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route
          path="/supplier-portal"
          element={
            <ProtectedRoute roles={['SUPPLIER']}>
              <SupplierPortalPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supplier-portal/purchase-orders/:id"
          element={
            <ProtectedRoute roles={['SUPPLIER']}>
              <PoDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supplier-portal/returns/:id"
          element={
            <ProtectedRoute roles={['SUPPLIER']}>
              <ReturnDetailPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function asUser(role: string) {
  mockUseAuth.mockReturnValue({
    user: { id: 'u1', username: 'testuser', role, mustChangePassword: false },
    loading: false,
  } as ReturnType<typeof useAuth>);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Supplier portal route permissions — SUPPLIER-only policy', () => {
  describe('/supplier-portal', () => {
    it('renders for SUPPLIER', () => {
      asUser('SUPPLIER');
      renderPortalRoutes('/supplier-portal');
      expect(screen.getByText('Supplier Portal Content')).toBeInTheDocument();
    });

    it('redirects ADMINISTRATOR to /unauthorized', () => {
      asUser('ADMINISTRATOR');
      renderPortalRoutes('/supplier-portal');
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
      expect(screen.queryByText('Supplier Portal Content')).not.toBeInTheDocument();
    });

    it('redirects PROCUREMENT_MANAGER to /unauthorized', () => {
      asUser('PROCUREMENT_MANAGER');
      renderPortalRoutes('/supplier-portal');
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    });

    it('redirects WAREHOUSE_CLERK to /unauthorized', () => {
      asUser('WAREHOUSE_CLERK');
      renderPortalRoutes('/supplier-portal');
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    });

    it('redirects PLANT_CARE_SPECIALIST to /unauthorized', () => {
      asUser('PLANT_CARE_SPECIALIST');
      renderPortalRoutes('/supplier-portal');
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    });
  });

  describe('/supplier-portal/purchase-orders/:id', () => {
    it('renders for SUPPLIER', () => {
      asUser('SUPPLIER');
      renderPortalRoutes('/supplier-portal/purchase-orders/po-abc');
      expect(screen.getByText('PO Detail')).toBeInTheDocument();
    });

    it('redirects ADMINISTRATOR to /unauthorized', () => {
      asUser('ADMINISTRATOR');
      renderPortalRoutes('/supplier-portal/purchase-orders/po-abc');
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
      expect(screen.queryByText('PO Detail')).not.toBeInTheDocument();
    });

    it('redirects PROCUREMENT_MANAGER to /unauthorized', () => {
      asUser('PROCUREMENT_MANAGER');
      renderPortalRoutes('/supplier-portal/purchase-orders/po-abc');
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    });
  });

  describe('/supplier-portal/returns/:id', () => {
    it('renders for SUPPLIER', () => {
      asUser('SUPPLIER');
      renderPortalRoutes('/supplier-portal/returns/ret-xyz');
      expect(screen.getByText('Return Detail')).toBeInTheDocument();
    });

    it('redirects ADMINISTRATOR to /unauthorized', () => {
      asUser('ADMINISTRATOR');
      renderPortalRoutes('/supplier-portal/returns/ret-xyz');
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
      expect(screen.queryByText('Return Detail')).not.toBeInTheDocument();
    });

    it('redirects WAREHOUSE_CLERK to /unauthorized', () => {
      asUser('WAREHOUSE_CLERK');
      renderPortalRoutes('/supplier-portal/returns/ret-xyz');
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    });
  });

  // ── Security: direct URL access across role-restricted areas ──────────

  describe('direct URL access — cross-role boundary enforcement', () => {
    it('SUPPLIER navigating directly to /admin is blocked', () => {
      asUser('SUPPLIER');
      render(
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/login" element={<div>Login</div>} />
            <Route path="/unauthorized" element={<div>Unauthorized</div>} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={['ADMINISTRATOR']}>
                  <div>Admin Panel</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
      expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
    });

    it('WAREHOUSE_CLERK navigating directly to /procurement is blocked', () => {
      asUser('WAREHOUSE_CLERK');
      render(
        <MemoryRouter initialEntries={['/procurement']}>
          <Routes>
            <Route path="/login" element={<div>Login</div>} />
            <Route path="/unauthorized" element={<div>Unauthorized</div>} />
            <Route
              path="/procurement"
              element={
                <ProtectedRoute roles={['PROCUREMENT_MANAGER', 'ADMINISTRATOR']}>
                  <div>Procurement Dashboard</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
      expect(screen.queryByText('Procurement Dashboard')).not.toBeInTheDocument();
    });

    it('unauthenticated user navigating directly to /admin is redirected to login', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        loading: false,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
      } as any);
      render(
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/login" element={<div>Login</div>} />
            <Route path="/unauthorized" element={<div>Unauthorized</div>} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={['ADMINISTRATOR']}>
                  <div>Admin Panel</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.getByText('Login')).toBeInTheDocument();
      expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
    });
  });
});
