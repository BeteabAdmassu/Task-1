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

function renderRoute(
  _authState: { user: unknown; loading: boolean },
  path: string,
  roles?: string[],
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/unauthorized" element={<div>Unauthorized</div>} />
        <Route
          path="/protected"
          element={
            <ProtectedRoute roles={roles as Parameters<typeof ProtectedRoute>[0]['roles']}>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/admin" element={
          <ProtectedRoute roles={['ADMINISTRATOR'] as Parameters<typeof ProtectedRoute>[0]['roles']}>
            <div>Admin Content</div>
          </ProtectedRoute>
        } />
        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <div>Change Password Page</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('redirects to /login when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false } as ReturnType<typeof useAuth>);
    renderRoute({ user: null, loading: false }, '/protected');
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders children when authenticated with no role restriction', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', username: 'alice', role: 'PROCUREMENT_MANAGER', mustChangePassword: false },
      loading: false,
    } as ReturnType<typeof useAuth>);
    renderRoute({ user: {}, loading: false }, '/protected');
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('renders admin content for ADMINISTRATOR role', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', username: 'admin', role: 'ADMINISTRATOR', mustChangePassword: false },
      loading: false,
    } as ReturnType<typeof useAuth>);
    renderRoute({ user: {}, loading: false }, '/admin', ['ADMINISTRATOR']);
    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  it('redirects to /unauthorized when role does not match', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u2', username: 'clerk', role: 'WAREHOUSE_CLERK', mustChangePassword: false },
      loading: false,
    } as ReturnType<typeof useAuth>);
    renderRoute({ user: {}, loading: false }, '/admin', ['ADMINISTRATOR']);
    expect(screen.getByText('Unauthorized')).toBeInTheDocument();
  });

  it('shows loading state while auth resolves', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: true,
    } as ReturnType<typeof useAuth>);
    renderRoute({ user: null, loading: true }, '/protected');
    // During loading we should not see login page yet
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /change-password when mustChangePassword is true', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', username: 'admin', role: 'ADMINISTRATOR', mustChangePassword: true },
      loading: false,
    } as ReturnType<typeof useAuth>);
    renderRoute({ user: {}, loading: false }, '/protected');
    expect(screen.getByText('Change Password Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('does not redirect when already on /change-password (no loop)', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', username: 'admin', role: 'ADMINISTRATOR', mustChangePassword: true },
      loading: false,
    } as ReturnType<typeof useAuth>);
    renderRoute({ user: {}, loading: false }, '/change-password');
    expect(screen.getByText('Change Password Page')).toBeInTheDocument();
  });

  it('allows access to protected route when mustChangePassword is false', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', username: 'admin', role: 'ADMINISTRATOR', mustChangePassword: false },
      loading: false,
    } as ReturnType<typeof useAuth>);
    renderRoute({ user: {}, loading: false }, '/admin', ['ADMINISTRATOR']);
    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });
});
