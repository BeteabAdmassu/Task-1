import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

// ── Helpers ──────────────────────────────────────────────────────────────────

function TestConsumer() {
  const { user, loading, error, login, logout } = useAuth();
  if (loading) return <div>Loading</div>;
  if (error) return <div data-testid="error">{error}</div>;
  if (user)
    return (
      <div>
        <span data-testid="username">{user.username}</span>
        <span data-testid="role">{user.role}</span>
        {user.mustChangePassword && <span data-testid="must-change">true</span>}
        <button onClick={() => void logout()}>Logout</button>
      </div>
    );
  return (
    <button
      onClick={() => {
        login('admin', 'password').catch(() => {
          // error displayed via context.error
        });
      }}
    >
      Login
    </button>
  );
}

function renderWithProvider() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AuthContext', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading then unauthenticated state when refresh fails', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false });

    renderWithProvider();
    expect(screen.getByText('Loading')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Login')).toBeInTheDocument());
  });

  it('restores session from refresh token on mount', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        accessToken: 'token123',
        user: { id: 'u1', username: 'admin', role: 'ADMINISTRATOR', mustChangePassword: false },
      }),
    });

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId('username')).toHaveTextContent('admin'));
    expect(screen.getByTestId('role')).toHaveTextContent('ADMINISTRATOR');
  });

  it('sets mustChangePassword flag from login response', async () => {
    // Refresh fails (no existing session)
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false })
      // Login call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'token123',
          user: { id: 'u1', username: 'admin', role: 'ADMINISTRATOR', mustChangePassword: true },
        }),
      });

    renderWithProvider();
    await waitFor(() => screen.getByText('Login'));

    const user = userEvent.setup();
    await user.click(screen.getByText('Login'));

    await waitFor(() => expect(screen.getByTestId('must-change')).toHaveTextContent('true'));
  });

  it('clears user state on logout', async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'token',
          user: { id: 'u1', username: 'admin', role: 'ADMINISTRATOR', mustChangePassword: false },
        }),
      })
      // logout call
      .mockResolvedValueOnce({ ok: true });

    renderWithProvider();
    await waitFor(() => screen.getByTestId('username'));

    const user = userEvent.setup();
    await user.click(screen.getByText('Logout'));

    await waitFor(() => expect(screen.getByText('Login')).toBeInTheDocument());
  });

  it('surfaces login error', async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false }) // refresh fails
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Invalid credentials' }),
      });

    renderWithProvider();
    await waitFor(() => screen.getByText('Login'));

    const user = userEvent.setup();
    await user.click(screen.getByText('Login'));

    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent('Invalid credentials'),
    );
  });
});
