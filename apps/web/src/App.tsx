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
      <Route path="/app" element={<UserApp />} />
      <Route path="/app/note/:id" element={<UserApp />} />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}

export function App() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return (
    <AuthProviderComponent>
      <BrowserRouter basename={base || undefined}>
        <Routed />
      </BrowserRouter>
    </AuthProviderComponent>
  );
}
