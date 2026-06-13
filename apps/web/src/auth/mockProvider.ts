import type { AuthProvider, Session } from './types';
import { uid } from '@/lib/id';

/**
 * 本地 Mock 认证：用于在未接入 Supabase 时演示登录/游客流程。
 * 接入 Supabase 后用 supabaseProvider 替换（见 AuthContext seam）。
 */
const KEY = 'webbook:session';

export const mockProvider: AuthProvider = {
  async getSession() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  },
  async signIn(email, _password) {
    const session: Session = {
      userId: uid('user'),
      email,
      role: email.startsWith('admin') ? 'admin' : 'user',
      token: 'mock-token-' + uid(),
    };
    localStorage.setItem(KEY, JSON.stringify(session));
    return session;
  },
  async signUp(email, password) {
    return this.signIn(email, password);
  },
  async signOut() {
    localStorage.removeItem(KEY);
  },
};
