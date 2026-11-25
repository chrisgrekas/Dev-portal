import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, setUnauthorizedHandler, tokenStore } from '../api/client';
import type { Principal, Role } from '../api/types';

interface SessionUser {
  email: string;
  role: Role;
}

interface AuthState {
  user: SessionUser | null;
  ready: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  // Επαναφορά συνεδρίας από αποθηκευμένο token.
  useEffect(() => {
    if (!tokenStore.get()) {
      setReady(true);
      return;
    }
    let alive = true;
    api<Principal>('/auth/me')
      .then((p) => alive && setUser({ email: p.name, role: p.role }))
      .catch(() => tokenStore.clear())
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ accessToken: string; user: { email: string; role: Role } }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    tokenStore.set(r.accessToken);
    setUser({ email: r.user.email, role: r.user.role });
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      canEdit: user?.role === 'admin' || user?.role === 'editor',
      isAdmin: user?.role === 'admin',
      login,
      logout,
    }),
    [user, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}
