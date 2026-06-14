import { useEffect, useState, useCallback } from 'react';
import type { Note, NoteTree, TreeNode } from '@webbook/shared';
import { createEmptyNote } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiClient } from '@/lib/api';
import { uid } from '@/lib/id';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { toast } from '@/store/useToastStore';

function patchNode(nodes: TreeNode[], id: string, patch: Partial<TreeNode>): TreeNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, ...patch };
    if (n.children) return { ...n, children: patchNode(n.children, id, patch) };
    return n;
  });
}

export function CircleNotesTab({
  circleId,
  canEdit,
}: {
  circleId: string;
  canEdit: boolean;
}) {
  const { session } = useAuth();
  const token = session?.token;
  const [tree, setTree] = useState<NoteTree>({ schemaVersion: 1, roots: [] });
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const t = await apiClient.loadCircleTree(circleId, token);
      setTree(t);
    } catch {
      toast('error', '加载圈子笔记失败');
    } finally {
      setLoading(false);
    }
  }, [circleId, token]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function selectNote(noteId: string) {
    if (!token) return;
    try {
      const note = await apiClient.loadCircleNote(circleId, noteId, token);
      setActiveNote(note);
    } catch {
      toast('error', '无法打开笔记');
    }
  }

  async function persist(note: Note, nextTree: NoteTree) {
    if (!token || !canEdit) return;
    setSaving(true);
    try {
      await apiClient.saveCircleNote(circleId, note, token);
      await apiClient.saveCircleTree(circleId, nextTree, token);
    } catch {
      toast('error', '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!token || !canEdit) return;
    const id = uid('note');
    const note = createEmptyNote(id, '新笔记');
    const node: TreeNode = { id, kind: 'note', title: note.title, noteId: id };
    const nextTree = { ...tree, roots: [...tree.roots, node] };
    setTree(nextTree);
    setActiveNote(note);
    await persist(note, nextTree);
  }

  function updateTitle(title: string) {
    if (!activeNote) return;
    const updated = { ...activeNote, title, updatedAt: new Date().toISOString() };
    const nextTree = { ...tree, roots: patchNode(tree.roots, activeNote.id, { title }) };
    setActiveNote(updated);
    setTree(nextTree);
    void persist(updated, nextTree);
  }

  function updateBlocks(blocks: Note['blocks']) {
    if (!activeNote || !canEdit) return;
    const updated = { ...activeNote, blocks, updatedAt: new Date().toISOString() };
    setActiveNote(updated);
    void persist(updated, tree);
  }

  if (loading) return <p className="muted">加载协作笔记…</p>;

  return (
    <div className="circle-notes-layout">
      <aside className="circle-notes-sidebar">
        <div className="circle-notes-sidebar-head">
          <span className="muted">圈子协作本</span>
          {canEdit && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void addNote()}>
              新建
            </button>
          )}
        </div>
        {!canEdit && (
          <p className="muted circle-notes-hint">只读模式。开启「允许共享编辑」后可协作修改。</p>
        )}
        <ul className="circle-notes-list">
          {tree.roots.map((n) =>
            n.kind === 'note' ? (
              <li key={n.id}>
                <button
                  type="button"
                  className={`circle-note-item ${activeNote?.id === n.id ? 'active' : ''}`}
                  onClick={() => void selectNote(n.noteId ?? n.id)}
                >
                  {n.title || '未命名'}
                </button>
              </li>
            ) : null,
          )}
          {tree.roots.length === 0 && <li className="muted">还没有协作笔记</li>}
        </ul>
      </aside>
      <div className="circle-notes-editor">
        {!activeNote && <p className="muted">选择或新建一篇协作笔记</p>}
        {activeNote && (
          <>
            <div className="circle-notes-editor-head">
              <input
                className="note-title-input"
                value={activeNote.title}
                readOnly={!canEdit}
                onChange={(e) => updateTitle(e.target.value)}
              />
              <span className="muted">{saving ? '保存中…' : '已保存'}</span>
            </div>
            <BlockEditor blocks={activeNote.blocks} onChange={updateBlocks} readOnly={!canEdit} />
          </>
        )}
      </div>
    </div>
  );
}
