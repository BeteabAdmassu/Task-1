/**
 * E2E smoke flow: login as SUPPLIER → redirected to /supplier-portal → portal
 * renders supplier profile data.
 *
 * Uses real AuthProvider + Login page + SupplierPortal page (API modules mocked).
 * Exercises the full frontend auth → route-guard → protected-page pipeline
 * for the SUPPLIER role.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { AuthProvider } from '../contexts/AuthContext';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { Login } from '../pages/Login';
import { SupplierPortal } from '../pages/SupplierPortal';

// ── Mock API modules used by SupplierPortal and its child components ──────────

vi.mock('../api/suppliers', () => ({
  fetchSupplierPortalProfile: vi.fn(),
}));

vi.mock('../api/purchase-orders', () => ({
  fetchPortalPos: vi.fn(),
}));

vi.mock('../api/returns', () => ({
  fetchPortalReturns: vi.fn(),
}));

import { fetchSupplierPortalProfile } from '../api/suppliers';
import { fetchPortalPos } from '../api/purchase-orders';
import { fetchPortalReturns } from '../api/returns';

const mockFetchProfile = vi.mocked(fetchSupplierPortalProfile);
const mockFetchPos = vi.mocked(fetchPortalPos);
const mockFetchReturns = vi.mocked(fetchPortalReturns);

// ── Render helper: Login + protected /supplier-portal ─────────────────────────

function renderSupplierApp() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<div>Unauthorized</div>} />
          <Route path="/change-password" element={<div>Change Password</div>} />
          <Route
            path="/supplier-portal"
            element={
              <ProtectedRoute roles={['SUPPLIER']}>
                <SupplierPortal />
              </ProtectedRoute>
            }
          />
          {/* Role-redirect targets for non-SUPPLIER logins */}
          <Route path="/admin" element={<div>Admin Dashboard</div>} />
          <Route path="/procurement" element={<div>Procurement Dashboard</div>} />
          <Route path="/warehouse" element={<div>Warehouse Dashboard</div>} />
          <Route path="/plant-care" element={<div>Plant Care Dashboard</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Supplier portal smoke flow', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());

    // Stable API mock responses for SupplierPortal child components
    mockFetchProfile.mockResolvedValue({
      id: 'sup-1',
      name: 'Acme Corp',
      contactName: 'Alice Smith',
      email: 'alice@acme.com',
      phone: '555-0100',
      address: '1 Acme Way',
      paymentTerms: 'NET_30',
      customTermsDescription: null,
      isActive: true,
    } as any);

    mockFetchPos.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    } as any);

    mockFetchReturns.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('login as SUPPLIER → redirected to /supplier-portal → profile renders', async () => {
    (fetch as ReturnType<typeof vi.fn>)
      // AuthProvider tries to restore session on mount — no existing session
      .mockResolvedValueOnce({ ok: false })
      // Login POST — returns SUPPLIER user
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'supplier-access-token',
          user: {
            id: 'u-sup',
            username: 'acme_supplier',
            role: 'SUPPLIER',
            mustChangePassword: false,
          },
        }),
      });

    renderSupplierApp();

    // Wait for the login form to appear (AuthProvider resolves loading)
    await waitFor(() => screen.getByLabelText(/username/i));

    // Fill in credentials and submit
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/username/i), 'acme_supplier');
    await user.type(screen.getByLabelText(/password/i), 'password1');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // Should navigate to /supplier-portal and render the portal heading
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /supplier portal/i })).toBeInTheDocument(),
    );

    // Supplier profile data should appear
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(mockFetchProfile).toHaveBeenCalledTimes(1);
  });

  it('ADMINISTRATOR login does NOT land on /supplier-portal', async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false }) // refresh fails
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'admin-token',
          user: {
            id: 'u-admin',
            username: 'admin',
            role: 'ADMINISTRATOR',
            mustChangePassword: false,
          },
        }),
      });

    renderSupplierApp();

    await waitFor(() => screen.getByLabelText(/username/i));

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'adminpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // ADMINISTRATOR redirects to /admin, NOT /supplier-portal
    await waitFor(() =>
      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument(),
    );

    expect(screen.queryByRole('heading', { name: /supplier portal/i })).not.toBeInTheDocument();
    // Profile API must not have been called for admin
    expect(mockFetchProfile).not.toHaveBeenCalled();
  });
});
