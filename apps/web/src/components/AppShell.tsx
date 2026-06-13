import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { TreeSidebar } from './TreeSidebar';

export function AppShell({
  children,
  editable = true,
}: {
  children: ReactNode;
  editable?: boolean;
}) {
  const { session, isGuest, signOut } = useAuth();
  return (
    <div className="shell">
      <TreeSidebar editable={editable} />
      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-left muted">
            {isGuest ? '游客模式（数据仅存本机，不会同步）' : `已登录：${session?.email}`}
          </div>
          <div className="topbar-right">
            <Link className="btn btn-ghost" to="/admin">
              后台
            </Link>
            {isGuest ? (
              <Link className="btn btn-primary" to="/login">
                登录以保存
              </Link>
            ) : (
              <button className="btn btn-ghost" onClick={() => signOut()}>
                退出
              </button>
            )}
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
