import type { Env } from './env';

export interface AuthUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
}

/** 用 Supabase Auth API 校验用户 JWT */
export async function verifyUserToken(
  env: Env,
  token: string | null,
): Promise<AuthUser | null> {
  if (!token) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as {
    id: string;
    email?: string;
    app_metadata?: { role?: string };
    user_metadata?: { role?: string };
  };
  const role =
    user.app_metadata?.role === 'admin' || user.user_metadata?.role === 'admin'
      ? 'admin'
      : 'user';
  return { id: user.id, email: user.email ?? '', role };
}

export function extractBearer(req: Request): string | null {
  const h = req.headers.get('Authorization');
  if (!h?.startsWith('Bearer ')) return null;
  return h.slice(7);
}
