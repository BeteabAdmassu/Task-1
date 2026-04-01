import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import { Login } from '../pages/Login';

// ── Location spy helper ───────────────────────────────────────────────────────

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/change-password" element={<LocationDisplay />} />
          <Route path="/admin" element={<LocationDisplay />} />
          <Route path="/procurement" element={<LocationDisplay />} />
          <Route path="/" element={<LocationDisplay />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Login page navigation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('navigates to /change-password when mustChangePassword is true', async () => {
    (fetch as ReturnType<typeof vi.fn>)
      // AuthContext refresh on mount (no existing session)
      .mockResolvedValueOnce({ ok: false })
      // login call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'token',
          user: { id: 'u1', username: 'admin', role: 'ADMINISTRATOR', mustChangePassword: true },
        }),
      });

    renderLogin();

    await waitFor(() => screen.getByLabelText(/username/i));

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'oldpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/change-password'),
    );
  });

  it('navigates to role path when mustChangePassword is false', async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'token',
          user: { id: 'u1', username: 'admin', role: 'ADMINISTRATOR', mustChangePassword: false },
        }),
      });

    renderLogin();

    await waitFor(() => screen.getByLabelText(/username/i));

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/admin'),
    );
  });

  it('shows error and does not navigate on login failure', async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Invalid credentials' }),
      });

    renderLogin();

    await waitFor(() => screen.getByLabelText(/username/i));

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument(),
    );
    // Still on login page
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
});
