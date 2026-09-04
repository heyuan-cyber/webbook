import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PublicFeedItem } from '@webbook/shared';
import { apiClient, type SiteConfig } from '@/lib/api';
import { nameFromEmail } from '@/lib/blog';
import { useAuth } from '@/auth/AuthContext';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { HomeTab } from './site/HomeTab';
import { WorkTab } from './site/WorkTab';
import { BlogTab } from './site/BlogTab';
import { SettingsTab } from './site/SettingsTab';
import { resolveIds, groupByCategory } from './site/shared';

export type SiteTabId = 'home' | 'work' | 'blog' | 'settings';

const TAB_LABELS: { id: SiteTabId; label: string }[] = [
  { id: 'home', label: '首页' },
  { id: 'work', label: '项目示例' },
  { id: 'blog', label: '博客' },
  { id: 'settings', label: '设置' },
];

export function UserBlogPage({
  userId,
  embedded = false,
}: {
  userId: string;
  embedded?: boolean;
}) {
  const { session } = useAuth();
  const [ownerEmail, setOwnerEmail] = useState('');
  const [posts, setPosts] = useState<PublicFeedItem[]>([]);
  const [site, setSite] = useState<SiteConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SiteTabId>('home');

  const isMe = session?.userId === userId;
  const ownerCanSettings = Boolean(isMe);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void apiClient
      .loadUserPublicFeed(userId)
      .then((res) => {
        setOwnerEmail(res.ownerEmail);
        setPosts(res.posts);
        setSite(res.site ?? null);
      })
      .catch(() => setError('无法加载博客'))
      .finally(() => setLoading(false));
  }, [userId]);

  const name = nameFromEmail(ownerEmail);
  const workPosts = useMemo(() => resolveIds(posts, site?.workNoteIds), [posts, site]);
  const blogPosts = useMemo(() => resolveIds(posts, site?.blogNoteIds), [posts, site]);
  const blogGroups = useMemo(
    () => groupByCategory(blogPosts, site?.blogCategoryOrder),
    [blogPosts, site],
  );

  const showSettings =
    ownerCanSettings && (activeTab === 'settings' || !embedded);

  const nav = (
    <nav className="io-site-nav" aria-label="站点导航">
      {TAB_LABELS.map((t) =>
        t.id === 'settings' && !ownerCanSettings ? null : (
          <button
            key={t.id}
            type="button"
            className={`io-site-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ),
      )}
    </nav>
  );

  const body =
    loading ? (
      <SiteSkeleton />
    ) : error ? (
      <p className="auth-error">{error}</p>
    ) : posts.length === 0 ? (
      <EmptyState icon="📄" title="还没有文章" body="这位作者还没有公开文章。" />
    ) : (
      <>
        {activeTab === 'home' && (
          <HomeTab name={name} advanceTab={() => setActiveTab('work')} />
        )}
        {activeTab === 'work' && (
          <WorkTab
            posts={workPosts}
            onConfigure={() => ownerCanSettings && setActiveTab('settings')}
            isOwner={ownerCanSettings}
          />
        )}
        {activeTab === 'blog' && (
          <BlogTab
            groups={blogGroups}
            isOwner={ownerCanSettings}
            onConfigure={() => ownerCanSettings && setActiveTab('settings')}
          />
        )}
        {showSettings && activeTab === 'settings' && (
          <SettingsTab posts={posts} site={site} onSaved={(next) => setSite(next)} />
        )}
      </>
    );

  if (embedded) {
    return (
      <div className="blog-embedded io-site-embedded">
        {nav}
        <div className="io-site-panel">{body}</div>
      </div>
    );
  }

  return (
    <div className="blog-shell io-site">
      <header className="io-site-hero-bar">
        <div className="io-site-brand">
          <span className="io-site-brand-avatar" aria-hidden="true">
            {name?.[0]?.toUpperCase() ?? '·'}
          </span>
          <span className="io-site-brand-name">{name}</span>
        </div>
        <div className="io-site-nav-wrap">
          {isMe ? (
            <Link className="btn btn-ghost btn-sm io-site-notebook" to="/app">
              进入笔记本
            </Link>
          ) : null}
          {nav}
        </div>
      </header>
      <main className="io-site-content">{body}</main>
    </div>
  );
}

function SiteSkeleton() {
  return (
    <div className="blog-list">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} style={{ height: 220, borderRadius: 'var(--radius-lg)' }} />
      ))}
    </div>
  );
}

export function UserBlogRoutePage() {
  const { userId } = useParams<{ userId: string }>();
  if (!userId) return null;
  return <UserBlogPage userId={userId} />;
}
