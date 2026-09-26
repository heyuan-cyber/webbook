import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TreeNode } from '@webbook/shared';
import { useNotesStore } from '@/store/useNotesStore';
import { usePlanStore } from '@/store/usePlanStore';
import type { SearchHit } from '@/store/useNotesStore';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { clampSidebarWidth, SIDEBAR_MIN_W, SIDEBAR_MAX_W } from '@/lib/storage';

export function TreeSidebar({
  editable = true,
  className,
  onNavigate,
  onCollapse,
  onOpenTreeHistory,
  onResize,
  resizable = false,
}: {
  editable?: boolean;
  className?: string;
  onNavigate?: () => void;
  /** 桌面端收起侧栏 */
  onCollapse?: () => void;
  /** 打开目录历史（仅登录用户传入；游客的目录不在云端，没有历史可看） */
  onOpenTreeHistory?: () => void;
  /** 拖拽调整宽度后回调（写入偏好由调用方负责） */
  onResize?: (width: number) => void;
  /** 桌面端显示右缘拖拽手柄（移动端是抽屉，不适用） */
  resizable?: boolean;
}) {
  const tree = useNotesStore((s) => s.tree);
  const searchNotes = useNotesStore((s) => s.searchNotes);
  const addFolder = useNotesStore((s) => s.addFolder);
  const addNote = useNotesStore((s) => s.addNote);
  const selectNote = useNotesStore((s) => s.selectNote);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [dragging, setDragging] = useState(false);

  /**
   * 拖拽调整侧栏宽度。
   * 目录最深有 6–7 级，固定宽度下标题会被挤到只剩一个字；
   * 这里给出可拖拽的右缘手柄（键盘用户可用 ← → 调整，步进 16px）。
   */
  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const startX = e.clientX;
    const el = e.currentTarget.parentElement;
    const startW = el ? el.getBoundingClientRect().width : 280;
    setDragging(true);
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);

    function onMove(ev: PointerEvent) {
      const next = clampSidebarWidth(startW + (ev.clientX - startX));
      onResize?.(next);
    }
    function onUp() {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function onHandleKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 48 : 16;
    const el = e.currentTarget.parentElement;
    const cur = el ? el.getBoundingClientRect().width : 280;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onResize?.(clampSidebarWidth(cur - step));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onResize?.(clampSidebarWidth(cur + step));
    }
  }

  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      void searchNotes(query).then(setHits);
    }, 250);
    return () => clearTimeout(t);
  }, [query, searchNotes, tree]);

  async function newRootNote() {
    const id = await addNote(null, '新笔记');
    navigate(`/app/note/${id}`);
    void selectNote(id);
    onNavigate?.();
  }

  return (
    <aside className={className ? `sidebar ${className}` : 'sidebar'}>
      <div className="sidebar-head">
        <span className="logo">
          <span className="logo-mark" aria-hidden="true">
            <Icon name="book" size={14} />
          </span>
          WebBook
        </span>
        {onCollapse && (
          <button
            type="button"
            className="btn btn-ghost btn-sm sidebar-collapse-btn"
            aria-label="收起目录"
            title="收起目录"
            onClick={onCollapse}
          >
            <Icon name="chevron-left" size={14} />
          </button>
        )}
      </div>
      {resizable && (
        <div
          className={`sidebar-resizer ${dragging ? 'is-dragging' : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整目录宽度"
          aria-valuemin={SIDEBAR_MIN_W}
          aria-valuemax={SIDEBAR_MAX_W}
          tabIndex={0}
          title="拖拽调整宽度（或用 ← → 键）"
          onPointerDown={startResize}
          onKeyDown={onHandleKey}
        />
      )}
      <div className="sidebar-search">
        <input
          className="search-input"
          placeholder="搜索笔记…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {hits.length > 0 && (
        <div className="search-hits">
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              className="search-hit"
              onClick={() => {
                navigate(`/app/note/${h.id}`);
                void selectNote(h.id);
                onNavigate?.();
                setQuery('');
              }}
            >
              <span className="search-hit-title">{h.title}</span>
              <span className="search-hit-snippet muted">{h.snippet}</span>
            </button>
          ))}
        </div>
      )}
      {editable && (
        <div className="sidebar-actions">
          <button type="button" className="btn btn-ghost" onClick={() => addFolder(null, '新栏目')}>
            <Icon name="folder" size={14} />
            栏目
          </button>
          <button type="button" className="btn btn-ghost" onClick={newRootNote}>
            <Icon name="plus" size={14} />
            笔记
          </button>
          {onOpenTreeHistory && (
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              title="目录历史：查看并恢复之前的目录版本"
              aria-label="目录历史"
              onClick={onOpenTreeHistory}
            >
              <Icon name="clock" size={14} />
            </button>
          )}
        </div>
      )}
      <div className="tree">
        {tree.roots.map((node) => (
          <TreeItem
            key={node.id}
            node={node}
            depth={0}
            editable={editable}
            onNavigate={onNavigate}
          />
        ))}
        {tree.roots.length === 0 && (
          <EmptyState
            icon="folder"
            title="还没有内容"
            body="点击「笔记」创建你的第一篇笔记。"
          />
        )}
      </div>
    </aside>
  );
}

function TreeItem({
  node,
  depth,
  editable,
  onNavigate,
}: {
  node: TreeNode;
  depth: number;
  editable: boolean;
  onNavigate?: () => void;
}) {
  const folds = useNotesStore((s) => s.folds);
  const toggleFold = useNotesStore((s) => s.toggleFold);
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const addFolder = useNotesStore((s) => s.addFolder);
  const addNote = useNotesStore((s) => s.addNote);
  const renameNode = useNotesStore((s) => s.renameNode);
  const deleteNode = useNotesStore((s) => s.deleteNode);
  const moveNode = useNotesStore((s) => s.moveNode);
  const selectNote = useNotesStore((s) => s.selectNote);
  const openPlanner = usePlanStore((s) => s.openPlanner);
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(node.title);

  const collapsed = folds[node.id] ?? node.collapsed ?? false;
  const isFolder = node.kind === 'folder';
  const active = activeNoteId === node.id;

  function onClick() {
    if (isFolder) {
      toggleFold(node.id);
    } else {
      navigate(`/app/note/${node.id}`);
      void selectNote(node.id);
      onNavigate?.();
    }
  }

  function onDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/webbook-node', node.id);
    e.stopPropagation();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const dragId = e.dataTransfer.getData('text/webbook-node');
    if (!dragId || dragId === node.id) return;
    // 拖到文件夹 → 放入其子级末尾；拖到笔记 → 放到其同级后面
    if (isFolder) {
      moveNode(dragId, node.id, (node.children?.length ?? 0));
    } else {
      moveNode(dragId, null, 0);
    }
  }

  return (
    <div className="tree-node" style={{ '--depth': depth } as React.CSSProperties}>
      <div
        className={`tree-row ${active ? 'active' : ''} ${isFolder ? 'is-dir' : ''}`}
        draggable={editable}
        onDragStart={onDragStart}
        onDragOver={(e) => editable && e.preventDefault()}
        onDrop={editable ? onDrop : undefined}
      >
        {isFolder ? (
          <button
            type="button"
            className="twisty"
            aria-label={collapsed ? `展开「${node.title}」` : `收起「${node.title}」`}
            aria-expanded={!collapsed}
            onClick={() => toggleFold(node.id)}
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} size={12} />
          </button>
        ) : (
          <span className="twisty leaf" aria-hidden="true" />
        )}
        {renaming ? (
          <input
            autoFocus
            className="rename-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              renameNode(node.id, draft || node.title);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          <span className="tree-label" onClick={onClick}>
            <span className="tree-ico" aria-hidden="true">
              <Icon name={isFolder ? (collapsed ? 'folder' : 'folder-open') : 'file'} size={14} />
            </span>
            {node.title}
          </span>
        )}
        {editable && (
          <span className="tree-tools">
            {isFolder && (
              <>
                <button type="button" aria-label="新建子笔记" title="新建子笔记" onClick={() => addNote(node.id, '新笔记')}>
                  <Icon name="plus" size={12} />
                </button>
                <button type="button" aria-label="新建子栏目" title="新建子栏目" onClick={() => addFolder(node.id, '新栏目')}>
                  <Icon name="folder" size={12} />
                </button>
              </>
            )}
            <button
              type="button"
              title="任务规划"
              aria-label={`打开「${node.title}」的任务规划`}
              onClick={() => openPlanner({ kind: 'node', nodeId: node.id })}
            >
              <Icon name="check-square" size={12} />
            </button>
            <button type="button" aria-label="重命名" title="重命名" onClick={() => setRenaming(true)}>
              <Icon name="pencil" size={12} />
            </button>
            <button type="button" aria-label="删除" title="删除" onClick={() => deleteNode(node.id)}>
              <Icon name="trash" size={12} />
            </button>
          </span>
        )}
      </div>
      {isFolder && !collapsed && node.children && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              editable={editable}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
