import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, MOTION, useMotionSafe } from './lib/motion';
import { AuthProviderComponent, useAuth } from './auth/AuthContext';
import { useNotesStore } from './store/useNotesStore';
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

function Routed() {
  const { session, loading } = useAuth();
  const init = useNotesStore((s) => s.init);
  const location = useLocation();
  const reduced = useMotionSafe();

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
