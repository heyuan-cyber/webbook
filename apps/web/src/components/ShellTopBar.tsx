import { type ReactNode, useEffect, useRef, useState } from 'react';
import { usePlanStore } from '@/store/usePlanStore';
import { Icon } from '@/components/Icon';
import { AccountMenu } from '@/components/AccountMenu';
import { CommandPalette } from '@/components/CommandPalette';

/**
 * 全站共享顶栏（openspec 方向一 · 第二步第 2 项）。
 *
 * 背景：`AppShell` 原先只被 `UserApp` 使用，所以 `/blog`、`/blog/u/*`、
 * `/app/circles`、`/admin` 都没有顶栏、没有 ⌘K、也没有账号入口 ——
 * 同一个产品点进去像换了个站点。
 *
 * 这里把顶栏抽成独立组件，连同**命令面板一起**，让守卫路由也能复用：
 *   - 左侧：调用方给的面包屑 / 标题（`children` 或 `left`）
 *   - 右侧：⌘K 命令栏 + 任务中心 + 账号菜单（全站一致）
 *
 * 关键点：CommandPalette 与它的 Ctrl+K 监听都在本组件内，
 * 所以**任何挂了顶栏的页面都自动获得 ⌘K**，不需要各自接线。
 *
 * 不含侧栏：侧栏只在笔记本里出现，其余页面按设计稿是"内容 + 共享顶栏"。
 */
export function ShellTopBar({
  left,
  className,
  showPlanner = true,
}: {
  /** 左侧内容（面包屑等）。不传则只渲染右侧动作区。 */
  left?: ReactNode;
  className?: string;
  /** 任务中心按钮：后台/博客这类页面可以关掉 */
  showPlanner?: boolean;
}) {
  const openPlanner = usePlanStore((s) => s.openPlanner);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** 命令栏按钮：面板关闭后把焦点还给这里 */
  const cmdbarRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header className={className ? `topbar ${className}` : 'topbar'}>
        <div className="topbar-left">{left}</div>
        <div className="topbar-right">
          <button
            type="button"
            className="cmdbar"
            ref={cmdbarRef}
            onClick={() => setPaletteOpen(true)}
            aria-label="搜索或跳转（Ctrl+K）"
          >
            <Icon name="search" size={14} />
            <span className="cmdbar-text">搜索或跳转…</span>
            <span className="cmdbar-k" aria-hidden="true">
              <kbd>Ctrl</kbd>
              <kbd>K</kbd>
            </span>
          </button>
          {showPlanner && (
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="任务中心"
              title="任务中心"
              onClick={() => openPlanner({ kind: 'all' })}
            >
              <Icon name="check-square" size={16} />
            </button>
          )}
          <AccountMenu />
        </div>
      </header>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        returnFocusTo={cmdbarRef.current}
      />
    </>
  );
}
