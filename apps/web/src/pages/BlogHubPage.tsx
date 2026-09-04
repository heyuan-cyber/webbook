import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { BloggerSummary, CircleSummary, PublicFeedItem } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiClient } from '@/lib/api';
import { blogPostPath, type BlogTab } from '@/lib/blog';
import { UserBlogPage } from './UserBlogPage';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { Reveal } from '@/components/Reveal';
import { avatarInitial, formatDate, nameFromEmail, userBlogPath } from '@/lib/blog';

function BlogFeedList({
  posts,
  loading,
  error,
  emptyText,
  circleId,
}: {
  posts: PublicFeedItem[];
  loading: boolean;
  error: string | null;
  emptyText: string;
  circleId?: string;
}) {
  if (loading)
    return (
      <div className="blog-list">
        {[0, 1, 2, 3].map((i) => (
          <li key={i}>
            <Skeleton style={{ height: 128, borderRadius: 'var(--radius-lg)' }} />
          </li>
        ))}
      </div>
    );
  if (error) return <p className="auth-error">{error}</p>;
  if (!loading && posts.length === 0)
    return <EmptyState icon="📄" title="暂无内容" body={emptyText} />;
  return (
    <div className="blog-list">
      {posts.map((post) => (
        <Reveal key={`${post.ownerId}:${post.noteId}`}>
          <Link to={blogPostPath(post, circleId)} className="blog-card">
            <span className="blog-card-cover" aria-hidden="true" />
            <span className="blog-card-title">{post.title}</span>
            {post.summary ? (
              <span className="blog-card-meta muted">{post.summary}</span>
            ) : null}
            <span className="blog-meta">
              {post.category ? <span className="category-badge">{post.category}</span> : null}
              <span>{nameFromEmail(post.ownerEmail)}</span>
              {formatDate(post.updatedAt)}
              {post.visibility === 'circle' ? <span>· 圈内</span> : null}
            </span>
            <span className="blog-card-cta muted">阅读 →</span>
          </Link>
        </Reveal>
      ))}
    </div>
  );
}

function BloggersStrip({ bloggers }: { bloggers: BloggerSummary[] }) {
  if (bloggers.length === 0) return null;
  return (
    <section className="blog-authors">
      <h2>博主</h2>
      <div className="blog-author-list">
        {bloggers.map((b) => (
          <Link key={b.userId} to={userBlogPath(b.userId)} className="blog-author-card">
            <span className="blog-author-avatar">{avatarInitial(b.email)}</span>
            <span className="blog-author-name">{nameFromEmail(b.email)}</span>
            <span className="blog-author-count muted">{b.postCount} 篇</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function BlogHubPage() {
  const { session, isGuest, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as BlogTab | null;
  const tab: BlogTab =
    tabParam === 'square' || tabParam === 'circles' || tabParam === 'mine'
      ? tabParam
      : isGuest
        ? 'square'
        : 'mine';

  const [squarePosts, setSquarePosts] = useState<PublicFeedItem[]>([]);
  const [circles, setCircles] = useState<CircleSummary[]>([]);
  const [bloggers, setBloggers] = useState<BloggerSummary[]>([]);
  const [circleFeeds, setCircleFeeds] = useState<Record<string, PublicFeedItem[]>>({});
  const [loadingSquare, setLoadingSquare] = useState(false);
  const [loadingCircles, setLoadingCircles] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setTab(next: BlogTab) {
    if (next === 'mine') {
      setSearchParams({});
    } else {
      setSearchParams({ tab: next });
    }
  }

  useEffect(() => {
    if (tab !== 'square') return;
    setLoadingSquare(true);
    void apiClient
      .loadSquareFeed()
      .then((res) => setSquarePosts(res.posts))
      .catch(() => setError('无法加载广场'))
      .finally(() => setLoadingSquare(false));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'circles' || isGuest || !session?.token) return;
    setLoadingCircles(true);
    void apiClient
      .listCircles(session.token)
      .then(async (res) => {
        setCircles(res.circles);
        const feeds: Record<string, PublicFeedItem[]> = {};
        await Promise.all(
          res.circles.map(async (c) => {
            try {
              const feed = await apiClient.getCircleFeed(c.id, session.token!);
              feeds[c.id] = feed.feed;
            } catch {
              feeds[c.id] = [];
            }
          }),
        );
        setCircleFeeds(feeds);
      })
      .catch(() => setError('无法加载圈子博客'))
      .finally(() => setLoadingCircles(false));
  }, [tab, isGuest, session?.token]);

  useEffect(() => {
    void apiClient
      .loadBloggers()
      .then((res) => setBloggers(res.bloggers))
      .catch(() => {});
  }, []);

  if (authLoading) return <p className="muted boot">加载中…</p>;

  return (
    <div className="blog-shell">
      <header className="blog-header">
        <div className="blog-header-inner">
          <h1>博客</h1>
          <p className="muted">个人博客 · 公开广场 · 圈子动态</p>
          <nav className="blog-nav">
            <Link to="/app">进入笔记本</Link>
            {!isGuest && <Link to="/app/circles">圈子</Link>}
            {isGuest && <Link to="/login">登录</Link>}
          </nav>
          <div className="blog-tabs" role="tablist">
            {!isGuest && (
              <button
                type="button"
                role="tab"
                className={`btn btn-ghost ${tab === 'mine' ? 'active' : ''}`}
                onClick={() => setTab('mine')}
              >
                我的博客
              </button>
            )}
            <button
              type="button"
              role="tab"
              className={`btn btn-ghost ${tab === 'square' ? 'active' : ''}`}
              onClick={() => setTab('square')}
            >
              博客广场
            </button>
            {!isGuest && (
              <button
                type="button"
                role="tab"
                className={`btn btn-ghost ${tab === 'circles' ? 'active' : ''}`}
                onClick={() => setTab('circles')}
              >
                圈子博客
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="blog-main">
        <BloggersStrip bloggers={bloggers} />
        {tab === 'mine' && session?.userId && <UserBlogPage userId={session.userId} embedded />}
        {tab === 'mine' && isGuest && (
          <p className="muted">
            登录后查看我的博客，或先浏览{' '}
            <button type="button" className="btn btn-ghost" onClick={() => setTab('square')}>
              博客广场
            </button>
          </p>
        )}
        {tab === 'square' && (
          <BlogFeedList
            posts={squarePosts}
            loading={loadingSquare}
            error={error}
            emptyText="广场还没有公开文章。"
          />
        )}
        {tab === 'circles' && (
          <>
            {loadingCircles && <p className="muted">加载中…</p>}
            {!loadingCircles && circles.length === 0 && (
              <p className="muted">
                还没有加入圈子。<Link to="/app/circles">去圈子</Link>
              </p>
            )}
            {circles.map((c) => (
              <section key={c.id} className="blog-circle-section">
                <h2>
                  <Link to={`/app/circles/${c.id}`}>{c.name}</Link>
                </h2>
                <BlogFeedList
                  posts={circleFeeds[c.id] ?? []}
                  loading={false}
                  error={null}
                  emptyText="圈内暂无博客动态（成员可将笔记设为圈子可见或完全公开）。"
                  circleId={c.id}
                />
              </section>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
