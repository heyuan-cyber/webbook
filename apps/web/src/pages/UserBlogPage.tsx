import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PublicFeedItem } from '@webbook/shared';
import { apiClient } from '@/lib/api';
import { blogPostPath } from '@/lib/blog';

export function UserBlogPage({ userId, embedded = false }: { userId: string; embedded?: boolean }) {
  const [ownerEmail, setOwnerEmail] = useState('');
  const [posts, setPosts] = useState<PublicFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void apiClient
      .loadUserPublicFeed(userId)
      .then((res) => {
        setOwnerEmail(res.ownerEmail);
        setPosts(res.posts);
      })
      .catch(() => setError('无法加载博客'))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div className={embedded ? 'blog-embedded' : 'blog-shell'}>
      {!embedded && (
        <header className="blog-header">
          <div className="blog-header-inner">
            <h1>{ownerEmail || '个人博客'}</h1>
            <p className="muted">完全公开的笔记</p>
            <nav className="blog-nav">
              <Link to="/app">进入笔记本</Link>
              <Link to="/app/circles">圈子</Link>
              <Link to="/blog">博客</Link>
            </nav>
          </div>
        </header>
      )}
      <main className={embedded ? '' : 'blog-main'}>
        {loading && <p className="muted">加载中…</p>}
        {error && <p className="auth-error">{error}</p>}
        {!loading && !error && posts.length === 0 && (
          <p className="muted">这位作者还没有公开文章。</p>
        )}
        <ul className="blog-list">
          {posts.map((post) => (
            <li key={`${post.ownerId}:${post.noteId}`}>
              <Link to={blogPostPath(post)} className="blog-card">
                <span className="blog-card-title">{post.title}</span>
                {post.summary && <span className="blog-card-meta muted">{post.summary}</span>}
                <span className="blog-card-cta muted">阅读 →</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

export function UserBlogRoutePage() {
  const { userId } = useParams<{ userId: string }>();
  if (!userId) return null;
  return <UserBlogPage userId={userId} />;
}
