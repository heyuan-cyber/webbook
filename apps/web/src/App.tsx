import { useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { AuthProviderComponent, useAuth } from './auth/AuthContext';
import { useNotesStore } from './store/useNotesStore';
import { UserApp } from './pages/UserApp';
import { AdminPanel } from './pages/AdminPanel';
import { LoginPage } from './pages/LoginPage';
import { BlogPage } from './pages/BlogPage';
import { BlogPostPage } from './pages/BlogPostPage';
import { BlogMeRedirect } from './pages/BlogMeRedirect';
import { UserBlogRoutePage } from './pages/UserBlogPage';
import { CircleListPage } from './pages/CircleListPage';
import { CircleDetailPage } from './pages/CircleDetailPage';

import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastHost } from './components/Toast';

function Routed() {
  const { session, loading } = useAuth();
  const init = useNotesStore((s) => s.init);

  useEffect(() => {
    if (!loading) init(session);
  }, [session, loading, init]);

  if (loading) {
    return <div className="boot muted">加载中…</div>;
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/blog/me" element={<BlogMeRedirect />} />
      <Route path="/blog/u/:userId" element={<UserBlogRoutePage />} />
      <Route path="/blog/:ownerId/:noteId" element={<BlogPostPage />} />
      <Route path="/blog/:id" element={<BlogPostPage />} />
      <Route path="/blog" element={<BlogPage />} />
      <Route path="/app" element={<UserApp />} />
      <Route path="/app/note/:id" element={<UserApp />} />
      <Route path="/app/circles" element={<CircleListPage />} />
      <Route path="/app/circles/:id" element={<CircleDetailPage />} />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
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
