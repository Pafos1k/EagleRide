import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { signInPath } from '../../shared/authReturn';
import type { AppUser } from '../../shared/auth';

interface AuthState {
  user: AppUser | null; loading: boolean; error: string;
  refresh: () => Promise<void>; signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const signingOut = useRef(false);
  async function refresh() {
    if (signingOut.current) return;
    const current = ++generation.current;
    setError('');
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      if (current !== generation.current) return;
      if (response.status === 401) { setUser(null); return; }
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? 'Unable to verify sign-in.');
      }
      const identity = await response.json();
      if (current === generation.current) setUser(identity);
    } catch (error) { if (current !== generation.current) return; setUser(null); setError(error instanceof Error ? error.message : 'Unable to verify sign-in.'); }
    finally { if (current === generation.current) setLoading(false); }
  }
  async function signOut() {
    signingOut.current = true;
    ++generation.current;
    let failure = '';
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) failure = 'Sign-out could not be fully confirmed. Please retry.';
    } catch { failure = 'Could not reach the server to clear the session. Please retry sign out.'; }
    signingOut.current = false;
    setLoading(false);
    setUser(null);
    setError(failure);
    if (failure) throw new Error(failure);
  }
  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  return <AuthContext.Provider value={{ user, loading, error, refresh, signOut }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw new Error('AuthProvider is missing');
  return state;
}
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p role="status" className="p-8 text-center">Checking sign-in...</p>;
  if (!user) return <Navigate replace to={signInPath(location.pathname + location.search)} />;
  return <>{children}</>;
}
