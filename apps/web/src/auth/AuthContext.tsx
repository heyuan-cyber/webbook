import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { AuthProvider, Session } from './types';
import { mockProvider } from './mockProvider';
import { supabaseProvider } from './supabaseProvider';

// 有 Supabase 配置时用真实认证，否则回退 mock（本地无 .env 时）
const provider: AuthProvider = import.meta.env.VITE_SUPABASE_URL
  ? supabaseProvider
  : mockProvider;

interface AuthState {
  session: Session | null;
  loading: boolean;
  isGuest: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProviderComponent({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    provider.getSession().then((s) => {
      setSession(s);
      setLoading(false);
    });
  }, []);

  const value: AuthState = {
    session,
    loading,
    isGuest: !session,
    isAdmin: session?.role === 'admin',
    async signIn(email, password) {
      setSession(await provider.signIn(email, password));
    },
    async signUp(email, password) {
      setSession(await provider.signUp(email, password));
    },
    async signOut() {
      await provider.signOut();
      setSession(null);
    },
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
