import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, MOTION, useMotionSafe } from './lib/motion';
import { AuthProviderComponent, useAuth } from './auth/AuthContext';
import { useNotesStore } from './store/useNotesStore';
import { useNativeHostStore } from './store/useNativeHostStore';
import { installBackButtonHandler } from './lib/backButton';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastHost } from './components/Toast';

const UserApp = lazy(() => import('./pages/UserApp').then((m) => ({ default: m.UserApp })));
const AdminPanel = lazy(() => import('./pages/AdminPanel').then((m) => ({ default: m.AdminPanel })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const BlogHubPage = lazy(() => import('./pages/BlogHubPage').then((m) => ({ default: m.BlogHubPage })));
const CircleBlogPostPage = lazy(() =>
  import('./pages/CircleBlogPostPage').then((m) => ({ default: m.CircleBlogPostPage })),
);
const BlogPostPage = lazy(() => import('./pages/BlogPostPage').then((m) => ({ default: m.BlogPostPage })));
const BlogMeRedirect = lazy(() =>
  import('./pages/BlogMeRedirect').then((m) => ({ default: m.BlogMeRedirect })),
);
const UserBlogRoutePage = lazy(() =>
  import('./pages/UserBlogPage').then((m) => ({ default: m.UserBlogRoutePage })),
);
const CircleListPage = lazy(() =>
  import('./pages/CircleListPage').then((m) => ({ default: m.CircleListPage })),
);
const CircleDetailPage = lazy(() =>
  import('./pages/CircleDetailPage').then((m) => ({ default: m.CircleDetailPage })),
);
const UsagePage = lazy(() => import('./pages/UsagePage').then((m) => ({ default: m.UsagePage })));
const ExpensePage = lazy(() =>
  import('./pages/ExpensePage').then((m) => ({ default: m.ExpensePage })),
);
const NotifyPage = lazy(() =>
  import('./pages/NotifyPage').then((m) => ({ default: m.NotifyPage })),
);

function Routed() {
  const { session, loading } = useAuth();
  const init = useNotesStore((s) => s.init);
  const probeHost = useNativeHostStore((s) => s.probe);
  const location = useLocation();
  const reduced = useMotionSafe();

  // 宿主能力探测只做一次：它包含一次原生往返，不该每个页面各做一遍。
  // 在浏览器里访问时探测是安全的——probeNativeBridge 保证不抛异常，只返回"不可用"。
  useEffect(() => {
    void probeHost();
  }, [probeHost]);

  // Android 返回键 / 侧滑：不接管的话 Capacitor 会直接退出应用，
  // 表现为"打开子页面后一滑就退出，回不去"。
  useEffect(() => {
    let handle: { dispose: () => void } | null = null;
    let cancelled = false;
    void installBackButtonHandler().then((h) => {
      if (cancelled) {
        h?.dispose();
        return;
      }
      handle = h;
    });
    return () => {
      cancelled = true;
      handle?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!loading) init(session);
  }, [session, loading, init]);

  if (loading) {
    return <div className="boot muted">加载中…</div>;
  }

  const children = (
    <Suspense fallback={<div className="boot muted">加载中…</div>}>
      <Routes location={location}>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/blog/me" element={<BlogMeRedirect />} />
        <Route path="/blog/u/:userId" element={<UserBlogRoutePage />} />
        <Route path="/blog/circle/:circleId/:ownerId/:noteId" element={<CircleBlogPostPage />} />
        <Route path="/blog/:ownerId/:noteId" element={<BlogPostPage />} />
        <Route path="/blog/:id" element={<BlogPostPage />} />
        <Route path="/blog" element={<BlogHubPage />} />
        <Route path="/app" element={<UserApp />} />
        <Route path="/app/note/:id" element={<UserApp />} />
        <Route path="/app/usage" element={<UsagePage />} />
        <Route path="/app/expense" element={<ExpensePage />} />
        <Route path="/app/notify" element={<NotifyPage />} />
        <Route path="/app/circles" element={<CircleListPage />} />
        <Route path="/app/circles/:id" element={<CircleDetailPage />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Suspense>
  );

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? undefined : { opacity: 0, y: -4 }}
        transition={reduced ? { duration: 0 } : MOTION.base}
        style={{ height: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function App() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return (
    <ErrorBoundary>
      <AuthProviderComponent>
        <BrowserRouter basename={base || undefined}>
          <Routed />
          <ToastHost />
        </BrowserRouter>
      </AuthProviderComponent>
    </ErrorBoundary>
  );
}
