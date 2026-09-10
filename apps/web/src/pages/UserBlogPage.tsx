import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PublicFeedItem } from '@webbook/shared';
import { apiClient, type SiteConfig } from '@/lib/api';
import { nameFromEmail } from '@/lib/blog';
import { useAuth } from '@/auth/AuthContext';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { useMotionSafe } from '@/lib/motion';
import { HomeTab } from './site/HomeTab';
import { WorkTab } from './site/WorkTab';
import { BlogTab } from './site/BlogTab';
import { SettingsTab } from './site/SettingsTab';
import { resolveIds, groupByCategory } from './site/shared';

type SiteSectionId = 'home' | 'work' | 'blog';

const SECTION_LABELS: { id: SiteSectionId; label: string }[] = [
  { id: 'home', label: '首页' },
  { id: 'work', label: '项目示例' },
  { id: 'blog', label: '博客' },
];

export function UserBlogPage({
  userId,
  embedded = false,
}: {
  userId: string;
  embedded?: boolean;
}) {
  const { session } = useAuth();
  const reduced = useMotionSafe();
  const [ownerEmail, setOwnerEmail] = useState('');
  const [posts, setPosts] = useState<PublicFeedItem[]>([]);
  const [site, setSite] = useState<SiteConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SiteSectionId>('home');
  const [showSettings, setShowSettings] = useState(false);

  const isMe = session?.userId === userId;
  const ownerCanSettings = Boolean(isMe);

  const homeRef = useRef<HTMLElement | null>(null);
  const workRef = useRef<HTMLElement | null>(null);
  const blogRef = useRef<HTMLElement | null>(null);
  const siteRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

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

  const sectionRefs: Record<SiteSectionId, React.RefObject<HTMLElement | null>> = {
    home: homeRef,
    work: workRef,
    blog: blogRef,
  };

  // Scroll-spy: highlight the tab whose section is currently in view. A single
  // passive scroll listener + rAF throttle keeps it cheap and motion-safe.
  const updateSpy = useCallback(() => {
    let current: SiteSectionId = 'home';
    for (const id of ['home', 'work', 'blog'] as SiteSectionId[]) {
      const el = sectionRefs[id].current;
      if (el && el.getBoundingClientRect().top <= 140) current = id;
    }
    setActiveSection(current);
  }, []);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        updateSpy();
      });
    };
    onScroll();
    // 站点全页模式滚动发生在其自身的滚动容器 .io-site 内；embedded 模式回退到 window。
    const scroller: HTMLElement | Window = siteRef.current ?? window;
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reduced, updateSpy]);

  const scrollTo = useCallback(
    (id: SiteSectionId) => {
      setActiveSection(id);
      const el = sectionRefs[id].current;
      if (el) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    },
    [reduced],
  );

  // 移动端导航为横向可滚 chip 条：切换分区时把激活 chip 滚入视野。
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>('.io-site-tab.active');
    active?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activeSection]);

  const nav = (
    <nav className="io-site-nav" aria-label="站点导航" ref={navRef}>
      {SECTION_LABELS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`io-site-tab ${activeSection === t.id ? 'active' : ''}`}
          onClick={() => scrollTo(t.id)}
        >
          {t.label}
        </button>
      ))}
      {ownerCanSettings ? (
        <button
          type="button"
          className={`io-site-tab ${showSettings ? 'active' : ''}`}
          onClick={() => {
            setShowSettings((v) => !v);
            setActiveSection('home');
          }}
        >
          设置
        </button>
      ) : null}
    </nav>
  );

  const sections = (
    <div className="io-site-scroll">
      <section id="swiss-home" ref={homeRef} className="io-site-section" aria-label="首页">
        <HomeTab name={name} onExplore={() => scrollTo('work')} />
      </section>
      <section id="swiss-work" ref={workRef} className="io-site-section swiss-section" aria-label="项目示例">
        <WorkTab
          posts={workPosts}
          isOwner={ownerCanSettings}
          onConfigure={() => setShowSettings(true)}
        />
      </section>
      <section id="swiss-blog" ref={blogRef} className="io-site-section swiss-section" aria-label="博客">
        <BlogTab
          groups={blogGroups}
          isOwner={ownerCanSettings}
          onConfigure={() => setShowSettings(true)}
        />
      </section>
      <footer className="swiss-footer">
        <span className="swiss-kicker">LET'S TALK</span>
        <h2>一起做点东西。</h2>
        <p>{name} 的个人主页 —— 用代码造作品，也把背后的思考写下来。</p>
      </footer>
    </div>
  );

  const body =
    loading ? (
      <SiteSkeleton />
    ) : error ? (
      <p className="auth-error">{error}</p>
    ) : posts.length === 0 ? (
      <EmptyState icon="📄" title="还没有文章" body="这位作者还没有公开文章。" />
    ) : showSettings && ownerCanSettings ? (
      <SettingsTab posts={posts} site={site} onSaved={(next) => setSite(next)} />
    ) : (
      sections
    );

  if (embedded) {
    return (
      <div className="blog-embedded io-site-embedded swiss-home">
        {nav}
        <div className="io-site-panel">{body}</div>
      </div>
    );
  }

  return (
    <div className="blog-shell io-site swiss-home" ref={siteRef}>
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
