import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { TreeSidebar } from './TreeSidebar';
import { InstallPrompt } from './InstallPrompt';
import { RemindersPanel } from './RemindersPanel';

export function AppShell({
  children,
  editable = true,
}: {
  children: ReactNode;
  editable?: boolean;
}) {
  const { session, isGuest, signOut } = useAuth();
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);

  function closeNav() {
    setNavOpen(false);
  }

  return (
    <div className="shell">
      {isMobile && navOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="关闭目录"
          onClick={closeNav}
        />
      )}
      <TreeSidebar
        editable={editable}
        className={isMobile && navOpen ? 'open' : undefined}
        onNavigate={isMobile ? closeNav : undefined}
      />
      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-left">
            {isMobile && (
              <button
                type="button"
                className="btn btn-ghost nav-toggle"
                aria-label="打开目录"
                onClick={() => setNavOpen(true)}
              >
                ☰
              </button>
            )}
            <span className="topbar-status muted">
              {isGuest ? '游客模式' : session?.email}
            </span>
          </div>
          <div className="topbar-right">
            <Link className="btn btn-ghost" to={isGuest ? '/blog' : '/blog/me'}>
              {isGuest ? '博客' : '我的博客'}
            </Link>
            {!isGuest && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setRemindersOpen(true)}
                >
                  提醒
                </button>
                <Link className="btn btn-ghost" to="/app/circles">
                  圈子
                </Link>
              </>
            )}
            <Link className="btn btn-ghost" to="/admin">
              后台
            </Link>
            {isGuest ? (
              <Link className="btn btn-primary" to="/login">
                登录
              </Link>
            ) : (
              <button className="btn btn-ghost" onClick={() => signOut()}>
                退出
              </button>
            )}
          </div>
        </header>
        <InstallPrompt />
        <RemindersPanel open={remindersOpen} onClose={() => setRemindersOpen(false)} />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
