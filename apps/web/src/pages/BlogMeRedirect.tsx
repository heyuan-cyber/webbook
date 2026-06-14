import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { userBlogPath } from '@/lib/blog';

/** 登录用户访问 /blog/me 时重定向到自己的独立博客 */
export function BlogMeRedirect() {
  const { session, isGuest, loading } = useAuth();

  if (loading) return <p className="muted boot">加载中…</p>;
  if (isGuest || !session?.userId) return <Navigate to="/login" replace />;
  return <Navigate to={userBlogPath(session.userId)} replace />;
}
