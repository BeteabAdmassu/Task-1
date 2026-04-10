import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  AuthUser,
  login as apiLogin,
  logout as apiLogout,
  setAccessToken,
} from '../api/auth';

// ── Service worker cache helpers ─────────────────────────────────────────────

function swPostMessage(msg: Record<string, unknown>): void {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(msg);
  }
}

function swClearCache(): Promise<void> {
  return new Promise((resolve) => {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      resolve();
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' }, [channel.port2]);
    setTimeout(resolve, 300);
  });
}

// ── Context ──────────────────────────────────────────────────────────────────

export interface AuthUserExtended extends AuthUser {
  mustChangePassword?: boolean;
}

interface AuthContextType {
  user: AuthUserExtended | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<AuthUserExtended>;
  logout: () => Promise<void>;
  clearError: () => void;
  updateUser: (patch: Partial<AuthUserExtended>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserExtended | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Try to restore session on mount
  useEffect(() => {
    fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { accessToken: string; user: AuthUserExtended } | null) => {
        if (data) {
          setAccessToken(data.accessToken);
          setUser(data.user);
          swPostMessage({ type: 'SET_USER', userId: data.user.id });
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<AuthUserExtended> => {
    setError(null);
    try {
      const result = await apiLogin(username, password);
      const userData = result.user as AuthUserExtended;
      setUser(userData);
      swPostMessage({ type: 'SET_USER', userId: userData.id });
      // Replay any mutations queued while the user was offline before login.
      swPostMessage({ type: 'SYNC_QUEUE' });
      return userData;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    // Wipe SW cache before clearing server session so stale protected data is gone
    await swClearCache();
    await apiLogout();
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const updateUser = useCallback((patch: Partial<AuthUserExtended>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, clearError, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
