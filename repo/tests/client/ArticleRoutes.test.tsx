import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../../client/src/components/ProtectedRoute';

// ── Mock AuthContext ──────────────────────────────────────────────────────────

vi.mock('../../client/src/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../client/src/contexts/AuthContext';
const mockUseAuth = vi.mocked(useAuth);

// ── Test pages ────────────────────────────────────────────────────────────────

function ArticleEditorPage() {
  return <div>Article Editor</div>;
}

function UnauthorizedPage() {
  return <div>Unauthorized</div>;
}

// ── Render helper mirroring App.tsx plant-care routes ─────────────────────────

function renderArticleRoutes(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route
          path="/plant-care"
          element={
            <ProtectedRoute
              roles={['PLANT_CARE_SPECIALIST', 'ADMINISTRATOR', 'WAREHOUSE_CLERK', 'PROCUREMENT_MANAGER']}
            >
              <Outlet />
            </ProtectedRoute>
          }
        >
          {/* Create — admin and specialists */}
          <Route
            path="articles/new"
            element={
              <ProtectedRoute roles={['ADMINISTRATOR', 'PLANT_CARE_SPECIALIST']}>
                <ArticleEditorPage />
              </ProtectedRoute>
            }
          />
          {/* Edit — admin and specialists */}
          <Route
            path="articles/:id/edit"
            element={
              <ProtectedRoute roles={['ADMINISTRATOR', 'PLANT_CARE_SPECIALIST']}>
                <ArticleEditorPage />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Article authoring route permissions', () => {
  describe('/plant-care/articles/new', () => {
    it('renders editor for ADMINISTRATOR', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'u1', username: 'admin', role: 'ADMINISTRATOR', mustChangePassword: false },
        loading: false,
      } as ReturnType<typeof useAuth>);

      renderArticleRoutes('/plant-care/articles/new');
      expect(screen.getByText('Article Editor')).toBeInTheDocument();
    });

    it('renders editor for PLANT_CARE_SPECIALIST (draft authoring)', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'u2', username: 'specialist', role: 'PLANT_CARE_SPECIALIST', mustChangePassword: false },
        loading: false,
      } as ReturnType<typeof useAuth>);

      renderArticleRoutes('/plant-care/articles/new');
      expect(screen.getByText('Article Editor')).toBeInTheDocument();
      expect(screen.queryByText('Unauthorized')).not.toBeInTheDocument();
    });

    it('redirects WAREHOUSE_CLERK to /unauthorized', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'u3', username: 'clerk', role: 'WAREHOUSE_CLERK', mustChangePassword: false },
        loading: false,
      } as ReturnType<typeof useAuth>);

      renderArticleRoutes('/plant-care/articles/new');
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    });

    it('redirects PROCUREMENT_MANAGER to /unauthorized', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'u4', username: 'pm', role: 'PROCUREMENT_MANAGER', mustChangePassword: false },
        loading: false,
      } as ReturnType<typeof useAuth>);

      renderArticleRoutes('/plant-care/articles/new');
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    });
  });

  describe('/plant-care/articles/:id/edit', () => {
    it('renders editor for ADMINISTRATOR', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'u1', username: 'admin', role: 'ADMINISTRATOR', mustChangePassword: false },
        loading: false,
      } as ReturnType<typeof useAuth>);

      renderArticleRoutes('/plant-care/articles/abc123/edit');
      expect(screen.getByText('Article Editor')).toBeInTheDocument();
    });

    it('renders editor for PLANT_CARE_SPECIALIST (draft editing)', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'u2', username: 'specialist', role: 'PLANT_CARE_SPECIALIST', mustChangePassword: false },
        loading: false,
      } as ReturnType<typeof useAuth>);

      renderArticleRoutes('/plant-care/articles/abc123/edit');
      expect(screen.getByText('Article Editor')).toBeInTheDocument();
      expect(screen.queryByText('Unauthorized')).not.toBeInTheDocument();
    });

    it('redirects WAREHOUSE_CLERK to /unauthorized', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'u3', username: 'clerk', role: 'WAREHOUSE_CLERK', mustChangePassword: false },
        loading: false,
      } as ReturnType<typeof useAuth>);

      renderArticleRoutes('/plant-care/articles/abc123/edit');
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    });
  });
});
