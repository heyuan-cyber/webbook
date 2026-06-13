import { createClient, type Session as SupaSession, type User } from '@supabase/supabase-js';
import type { AuthProvider, Session } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.toLowerCase();

export const supabase = createClient(url, anon);

function toSession(session: SupaSession): Session {
  const user = session.user;
  return {
    userId: user.id,
    email: user.email ?? '',
    role: resolveRole(user),
    token: session.access_token,
  };
}

function resolveRole(user: User): 'user' | 'admin' {
  const meta =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined);
  if (meta === 'admin') return 'admin';
  if (adminEmail && user.email?.toLowerCase() === adminEmail) return 'admin';
  return 'user';
}

export const supabaseProvider: AuthProvider = {
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session ? toSession(data.session) : null;
  },
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.session) throw new Error('登录失败');
    return toSession(data.session);
  },
  async signUp(email, password) {
    const role =
      adminEmail && email.toLowerCase() === adminEmail ? 'admin' : 'user';
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role } },
    });
    if (error) throw error;
    if (!data.session) {
      throw new Error('注册成功，请查收邮箱验证链接后再登录');
    }
    return toSession(data.session);
  },
  async signOut() {
    await supabase.auth.signOut();
  },
};
