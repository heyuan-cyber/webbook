import { type ReactNode, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { TreeNode } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { layoutUiState } from '@/lib/storage';
import { useNotesStore } from '@/store/useNotesStore';
import { TreeSidebar } from './TreeSidebar';
import { InstallPrompt } from './InstallPrompt';
import { PlanSurface } from './plan/PlanSurface';
import { TreeSyncNotice } from './TreeSyncNotice';
import { TreeHistoryPanel } from './TreeHistoryPanel';
import { Icon } from './Icon';
import { MobileNav } from './MobileNav';
import { ShellTopBar } from './ShellTopBar';
import { useThemeSync } from '@/lib/theme';

/** 从目录树里找出某个节点到根的路径（用于面包屑） */
function findPath(nodes: TreeNode[], id: string): TreeNode[] | null {
  for (const node of nodes) {
    if (node.id === id) return [node];
    if (node.children?.length) {
      const sub = findPath(node.children, id);
      if (sub) return [node, ...sub];
    }
  }
  return null;
}

export function AppShell({
  children,
  editable = true,
}: {
  children: ReactNode;
  editable?: boolean;
}) {
  const { isGuest } = useAuth();
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => layoutUiState.load().sidebarCollapsed,
  );
  // 侧栏宽度：默认 280px，可拖拽调整并记住（目录最深 6–7 级，固定宽度会挤掉标题）
  const [sidebarWidth, setSidebarWidth] = useState(() => layoutUiState.load().sidebarWidth);
  // 挂载时把持久化的皮肤同步到 <html data-theme>（首屏由 index.html 内联脚本先设好）
  useThemeSync();

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

  const [treeHistoryOpen, setTreeHistoryOpen] = useState(false);

  const desktopCollapsed = !isMobile && sidebarCollapsed;
  const sidebarClass = [
    isMobile && navOpen ? 'open' : '',
    desktopCollapsed ? 'is-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // ── 面包屑：顶栏显示"我在哪"，替代原先 7 个平级按钮 ────────────────
  const location = useLocation();
  const tree = useNotesStore((s) => s.tree);
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const path = activeNoteId ? findPath(tree.roots, activeNoteId) : null;
  // 过深的路径只保留末尾 3 段，避免顶栏被长标题挤爆
  const crumbs = path ? (path.length > 3 ? path.slice(-3) : path) : [];
  const isCircles = location.pathname.startsWith('/app/circles');
  const isHome = location.pathname === '/app' && !activeNoteId;
  const crumbLabel = isCircles ? '圈子' : isHome ? '笔记本' : activeNoteId ? null : '目录';

  return (
    <div
      className={`shell ${desktopCollapsed ? 'sidebar-collapsed' : ''}`}
      style={{ '--sidebar-w': `${sidebarWidth}px` } as React.CSSProperties}
    >
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
        onOpenTreeHistory={isGuest ? undefined : () => setTreeHistoryOpen(true)}
        resizable={!isMobile && !desktopCollapsed}
        onResize={(w) => {
          setSidebarWidth(w);
          layoutUiState.save({ sidebarWidth: w });
        }}
      />
      <div className="shell-main">
        {/* 顶栏（含 ⌘K 命令面板与账号菜单）抽到 ShellTopBar，
            让 /blog、/admin、/app/circles 也能复用同一套外壳 */}
        <ShellTopBar
          left={
            <div className="topbar-left">
              <button
                type="button"
                className="btn btn-ghost nav-toggle"
                aria-label={desktopCollapsed || isMobile ? '打开目录' : '收起目录'}
                aria-expanded={isMobile ? navOpen : !sidebarCollapsed}
                onClick={toggleSidebar}
              >
                <Icon name="list-tree" size={18} />
              </button>
              <nav className="crumb" aria-label="当前位置">
                {crumbs.length > 0 ? (
                  crumbs.map((c, i) => {
                    const last = i === crumbs.length - 1;
                    return (
                      <span key={c.id} className="crumb-part">
                        {i > 0 && (
                          <span className="crumb-sep" aria-hidden="true">
                            /
                          </span>
                        )}
                        <span className={last ? 'crumb-here' : 'crumb-link'} title={c.title}>
                          {c.title}
                        </span>
                      </span>
                    );
                  })
                ) : (
                  <span className="crumb-here">{crumbLabel}</span>
                )}
              </nav>
            </div>
          }
        />
        <InstallPrompt />
        <TreeSyncNotice />
        <PlanSurface />
        <TreeHistoryPanel open={treeHistoryOpen} onClose={() => setTreeHistoryOpen(false)} />
        <div className="content">{children}</div>
        {/* 移动端底部导航 + 悬浮新建（≤720px 才渲染） */}
        <MobileNav />
      </div>
    </div>
  );
}
