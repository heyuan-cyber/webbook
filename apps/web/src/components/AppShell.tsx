import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { layoutUiState } from '@/lib/storage';
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => layoutUiState.load().sidebarCollapsed,
  );

  function closeNav() {
    setNavOpen(false);
  }

  function toggleSidebar() {
    if (isMobile) {
      setNavOpen((o) => !o);
      return;
    }
    setSidebarCollapsed((c) => {
      const next = !c;
      layoutUiState.save({ sidebarCollapsed: next });
      return next;
    });
  }

  const desktopCollapsed = !isMobile && sidebarCollapsed;
  const sidebarClass = [
    isMobile && navOpen ? 'open' : '',
    desktopCollapsed ? 'is-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`shell ${desktopCollapsed ? 'sidebar-collapsed' : ''}`}>
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
        className={sidebarClass || undefined}
        onNavigate={isMobile ? closeNav : undefined}
        onCollapse={isMobile ? undefined : () => toggleSidebar()}
      />
      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="btn btn-ghost nav-toggle"
              aria-label={desktopCollapsed || isMobile ? '打开目录' : '收起目录'}
              aria-expanded={isMobile ? navOpen : !sidebarCollapsed}
              onClick={toggleSidebar}
            >
              ☰
            </button>
            <span className="topbar-status muted">
              {isGuest ? '游客模式' : session?.email}
            </span>
          </div>
          <div className="topbar-right">
            <Link className="btn btn-ghost" to="/blog">
              博客
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
