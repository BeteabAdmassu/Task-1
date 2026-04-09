/**
 * Offline UX tests for SearchResults and NotificationsList.
 *
 * Verifies that:
 *  - When navigator.onLine = false and the API call fails, an offline banner is shown
 *    instead of a generic error message.
 *  - When navigator.onLine = true and the API call fails, a normal error banner is shown.
 *  - The offline banner updates reactively when the browser fires 'online'/'offline' events.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Module-level mocks — these replace the entire module for this test file.
vi.mock('../api/search', () => ({
  searchArticles: vi.fn(),
}));
vi.mock('../api/notifications', () => ({
  fetchNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllRead: vi.fn(),
}));

import { searchArticles } from '../../client/src/api/search';
import { fetchNotifications } from '../../client/src/api/notifications';
import { SearchResults } from '../../client/src/pages/SearchResults';
import { NotificationsList } from '../../client/src/pages/NotificationsList';

// ── Helpers ───────────────────────────────────────────────────────────────────

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    writable: true,
    value,
  });
}

function renderSearch(query = 'ficus') {
  return render(
    <MemoryRouter initialEntries={[`/plant-care/search?q=${query}`]}>
      <SearchResults />
    </MemoryRouter>,
  );
}

function renderNotifications() {
  return render(
    <MemoryRouter>
      <NotificationsList />
    </MemoryRouter>,
  );
}

// ── SearchResults ─────────────────────────────────────────────────────────────

describe('SearchResults — offline UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setOnline(true);
  });

  afterEach(() => {
    setOnline(true);
  });

  it('shows an offline banner when the network is down and the search fails', async () => {
    setOnline(false);
    (searchArticles as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    renderSearch();

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/offline/i),
    );
    // No generic error banner when the cause is network loss
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a generic error banner when online but the server returns an error', async () => {
    setOnline(true);
    (searchArticles as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Internal server error'),
    );

    renderSearch();

    await waitFor(() =>
      expect(screen.getByText('Internal server error')).toBeInTheDocument(),
    );
    // No offline banner
    expect(screen.queryByText(/offline/i)).toBeNull();
  });

  it('shows the offline banner when the browser fires an offline event mid-session', async () => {
    (searchArticles as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      total: 0,
      expandedTerms: [],
    });

    renderSearch();

    // Wait for initial load to complete
    await waitFor(() => expect(searchArticles).toHaveBeenCalled());

    // Simulate going offline
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/offline/i),
    );
  });

  it('hides the offline banner when connectivity is restored', async () => {
    setOnline(false);
    (searchArticles as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    renderSearch();

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());

    // Simulate coming back online
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() =>
      expect(screen.queryByRole('status')).toBeNull(),
    );
  });
});

// ── NotificationsList ─────────────────────────────────────────────────────────

describe('NotificationsList — offline UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setOnline(true);
  });

  afterEach(() => {
    setOnline(true);
  });

  it('shows an offline banner when the network is down and fetch fails', async () => {
    setOnline(false);
    (fetchNotifications as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    renderNotifications();

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/offline/i),
    );
  });

  it('shows a generic error banner when online but the server errors', async () => {
    setOnline(true);
    (fetchNotifications as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Service unavailable'),
    );

    renderNotifications();

    await waitFor(() =>
      expect(screen.getByText('Service unavailable')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/offline/i)).toBeNull();
  });

  it('shows empty state (no error) when online and notifications list is empty', async () => {
    (fetchNotifications as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 30, total: 0, totalPages: 0 },
    });

    renderNotifications();

    await waitFor(() =>
      expect(screen.getByText('No notifications.')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('status')).toBeNull();
  });
});
