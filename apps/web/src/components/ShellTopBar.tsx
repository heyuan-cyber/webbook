import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { NoteVisibility } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { useNotesStore } from '@/store/useNotesStore';
import { usePlanStore } from '@/store/usePlanStore';
import { useEditorUiStore } from '@/store/useEditorUiStore';
import { Icon, type IconName } from '@/components/Icon';
import { AccountMenu } from '@/components/AccountMenu';
import { CommandPalette } from '@/components/CommandPalette';
import { FeishuExportButton } from '@/components/FeishuExportButton';
import { FeishuZipActions } from '@/components/FeishuZipActions';

/** 可见性 → 图标（原先是写进 <option> 文本里的 🔒 / 👥 / 🌐） */
const VISIBILITY_ICON: Record<NoteVisibility, IconName> = {
  private: 'lock',
  circle: 'users',
  public: 'globe',
};

const VISIBILITY_LABEL: Record<NoteVisibility, string> = {
  private: '仅自己',
  circle: '圈子可见',
  public: '完全公开',
};

/**
 * 全站共享顶栏（openspec 方向一 · 第二步第 2 项 + 元信息上移）。
 *
 * 背景：`AppShell` 原先只被 `UserApp` 使用，所以 `/blog`、`/blog/u/*`、
 * `/app/circles`、`/admin` 都没有顶栏、没有 ⌘K、也没有账号入口。
 * 这里把顶栏抽成独立组件，连同命令面板一起，让守卫路由也能复用。
 *
 * 另外（用户反馈的两点）：
 *   1. 笔记的元信息（保存态 / 可见性 / 预览 / 更多）从笔记头搬到这里，
 *      笔记头只留标题 —— 正文竖向空间从 68% 提到约 78%。
 *      低频动作（历史 / 飞书导入导出）收进「更多」菜单，避免顶栏被挤爆。
 *   2. 账号菜单改用 portal 渲染到 body：`.topbar` 带 `backdrop-filter`
 *      会强制产生层叠上下文，原先 `z-index:40` 被锁在里面，
 *      盖不过顶栏之下的内容。
 */

/** 笔记元信息条：只在 /app 有打开笔记时渲染 */
function NoteMetaBar() {
  const activeNote = useNotesStore((s) => s.activeNote);
  const saving = useNotesStore((s) => s.saving);
  const saveError = useNotesStore((s) => s.saveError);
  const setActiveVisibility = useNotesStore((s) => s.setActiveVisibility);
  const { session, isGuest } = useAuth();
  const preview = useEditorUiStore((s) => s.preview);
  const togglePreview = useEditorUiStore((s) => s.togglePreview);
  const moreOpen = useEditorUiStore((s) => s.moreOpen);
  const setMoreOpen = useEditorUiStore((s) => s.setMoreOpen);
  const historyOpen = useEditorUiStore((s) => s.historyOpen);
  const setHistoryOpen = useEditorUiStore((s) => s.setHistoryOpen);
  const moreRef = useRef<HTMLDivElement>(null);

  // 点击外部 / Esc 关闭「更多」
  useEffect(() => {
    if (!moreOpen) return;
    function onDown(e: MouseEvent) {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMoreOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen, setMoreOpen]);

  // 打开「更多」时收起历史面板，避免两个浮层叠在一起
  function toggleMore() {
    const next = !moreOpen;
    setMoreOpen(next);
    if (next && historyOpen) setHistoryOpen(false);
  }

  if (!activeNote) return null;
  const editable = !isGuest;

  return (
    <div className="note-meta-bar">
      <span
        className={`save-state ${saveError ? 'save-err' : ''}`}
        title={saveError ? '云端同步失败，内容已保存在本机' : '已同步到云端'}
      >
        <Icon name={saveError ? 'alert' : 'check'} size={12} />
        {saving ? '保存中…' : saveError ? '本地已存' : '已保存'}
      </span>

      {editable && (
        <label className="visibility-toggle" title={`可见性：${VISIBILITY_LABEL[activeNote.visibility]}`}>
          <Icon name={VISIBILITY_ICON[activeNote.visibility]} size={12} />
          <select
            value={activeNote.visibility}
            aria-label="笔记可见性"
            onChange={(e) => setActiveVisibility(e.target.value as NoteVisibility)}
          >
            <option value="private">仅自己</option>
            <option value="circle">圈子可见</option>
            <option value="public">完全公开</option>
          </select>
        </label>
      )}

      {editable && (
        <button
          type="button"
          className={`btn btn-ghost btn-sm ${preview ? 'active' : ''}`}
          aria-pressed={preview}
          onClick={togglePreview}
          title={preview ? '回到编辑' : '预览渲染效果'}
        >
          <Icon name="eye" size={14} />
          {preview ? '编辑' : '预览'}
        </button>
      )}

      {activeNote.visibility === 'public' && (
        <Link
          className="btn btn-ghost btn-icon"
          to={
            session?.userId
              ? `/blog/${session.userId}/${activeNote.id}`
              : `/blog/${activeNote.id}`
          }
          target="_blank"
          aria-label="打开博客预览"
          title="打开博客预览"
        >
          <Icon name="external" size={16} />
        </Link>
      )}

      {editable && (
        <div className="more-menu" ref={moreRef}>
          <button
            type="button"
            className={`btn btn-ghost btn-icon ${moreOpen ? 'active' : ''}`}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label="更多操作"
            title="更多操作"
            onClick={toggleMore}
          >
            <Icon name="grip" size={16} />
          </button>
          {moreOpen && (
            <div className="more-menu-pop" role="menu">
              <button
                type="button"
                className="more-menu-item"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  setHistoryOpen(true);
                }}
              >
                <Icon name="clock" size={14} />
                版本历史
              </button>
              <div className="more-menu-sep" />
              <div className="more-menu-block">
                <span className="more-menu-label">飞书导入 / 导出</span>
                <div className="more-menu-row">
                  <FeishuZipActions compact />
                  <FeishuExportButton />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
        {/* 笔记元信息：放在面包屑与命令栏之间，只在有打开笔记时出现 */}
        <NoteMetaBar />
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
