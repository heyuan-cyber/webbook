import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { BloggerSummary } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiClient } from '@/lib/api';
import { userBlogPath } from '@/lib/blog';

/** /blog 根路径：登录用户进我的博客；游客看博主目录 */
export function BlogPage() {
  const { session, isGuest, loading: authLoading } = useAuth();
  const [bloggers, setBloggers] = useState<BloggerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isGuest && session?.userId) return;
    setLoading(true);
    void apiClient
      .loadBloggers()
      .then((res) => setBloggers(res.bloggers))
      .catch(() => setError('无法加载博主列表'))
      .finally(() => setLoading(false));
  }, [authLoading, isGuest, session?.userId]);

  if (authLoading) return <p className="muted boot">加载中…</p>;
  if (!isGuest && session?.userId) {
    return <Navigate to={userBlogPath(session.userId)} replace />;
  }

  return (
    <div className="blog-shell">
      <header className="blog-header">
        <div className="blog-header-inner">
          <h1>WebBook 博主</h1>
          <p className="muted">每人独立博客，公开笔记即文章</p>
          <nav className="blog-nav">
            <Link to="/app">进入笔记本</Link>
            <Link to="/login">登录</Link>
          </nav>
        </div>
      </header>
      <main className="blog-main">
        {loading && <p className="muted">加载中…</p>}
        {error && <p className="auth-error">{error}</p>}
        {!loading && !error && bloggers.length === 0 && (
          <p className="muted">还没有公开博客。登录后将笔记设为「公开」即可拥有个人博客。</p>
        )}
        <ul className="blog-list">
          {bloggers.map((b) => (
            <li key={b.userId}>
              <Link to={userBlogPath(b.userId)} className="blog-card">
                <span className="blog-card-title">{b.email}</span>
                <span className="blog-card-meta muted">{b.postCount} 篇公开文章</span>
                <span className="blog-card-cta muted">进入博客 →</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
