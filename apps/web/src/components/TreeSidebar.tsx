import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TreeNode } from '@webbook/shared';
import { useNotesStore } from '@/store/useNotesStore';

export function TreeSidebar({
  editable = true,
  className,
  onNavigate,
}: {
  editable?: boolean;
  className?: string;
  onNavigate?: () => void;
}) {
  const tree = useNotesStore((s) => s.tree);
  const addFolder = useNotesStore((s) => s.addFolder);
  const addNote = useNotesStore((s) => s.addNote);
  const navigate = useNavigate();

  async function newRootNote() {
    const id = await addNote(null, '新笔记');
    navigate(`/app/note/${id}`);
    onNavigate?.();
  }

  return (
    <aside className={className ? `sidebar ${className}` : 'sidebar'}>
      <div className="sidebar-head">
        <span className="logo">📓 WebBook</span>
      </div>
      {editable && (
        <div className="sidebar-actions">
          <button className="btn btn-ghost" onClick={() => addFolder(null, '新栏目')}>
            + 栏目
          </button>
          <button className="btn btn-ghost" onClick={newRootNote}>
            + 笔记
          </button>
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
          <p className="muted tree-empty">还没有内容，点击「+ 笔记」开始。</p>
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
    <div className="tree-node">
      <div
        className={`tree-row ${active ? 'active' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={editable}
        onDragStart={onDragStart}
        onDragOver={(e) => editable && e.preventDefault()}
        onDrop={editable ? onDrop : undefined}
      >
        {isFolder ? (
          <span className="twisty" onClick={() => toggleFold(node.id)}>
            {collapsed ? '▸' : '▾'}
          </span>
        ) : (
          <span className="twisty leaf">·</span>
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
            {isFolder ? '📁' : '📄'} {node.title}
          </span>
        )}
        {editable && (
          <span className="tree-tools">
            {isFolder && (
              <>
                <button title="新建子笔记" onClick={() => addNote(node.id, '新笔记')}>
                  ＋
                </button>
                <button title="新建子栏目" onClick={() => addFolder(node.id, '新栏目')}>
                  ❏
                </button>
              </>
            )}
            <button title="重命名" onClick={() => setRenaming(true)}>
              ✎
            </button>
            <button title="删除" onClick={() => deleteNode(node.id)}>
              🗑
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
