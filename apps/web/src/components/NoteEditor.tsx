import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useNotesStore } from '@/store/useNotesStore';
import { BlockEditor } from './editor/BlockEditor';

export function NoteEditor({ readOnly = false }: { readOnly?: boolean }) {
  const { id } = useParams();
  const { isGuest } = useAuth();
  const activeNote = useNotesStore((s) => s.activeNote);
  const selectNote = useNotesStore((s) => s.selectNote);
  const setActiveTitle = useNotesStore((s) => s.setActiveTitle);
  const setActiveVisibility = useNotesStore((s) => s.setActiveVisibility);
  const updateActiveBlocks = useNotesStore((s) => s.updateActiveBlocks);
  const saving = useNotesStore((s) => s.saving);

  useEffect(() => {
    if (id) selectNote(id);
  }, [id, selectNote]);

  if (!id) {
    return (
      <main className="editor empty">
        <div className="empty-state">
          <h2>欢迎使用 WebBook</h2>
          <p className="muted">从左侧选择或新建一篇笔记开始记录。</p>
        </div>
      </main>
    );
  }

  if (!activeNote) {
    return (
      <main className="editor">
        <p className="muted">加载中…</p>
      </main>
    );
  }

  return (
    <main className="editor">
      <div className="editor-head">
        {readOnly ? (
          <h1 className="note-title">{activeNote.title}</h1>
        ) : (
          <input
            className="note-title-input"
            value={activeNote.title}
            onChange={(e) => setActiveTitle(e.target.value)}
            placeholder="笔记标题"
          />
        )}
        <span className="save-state muted">{saving ? '保存中…' : '已保存'}</span>
        {!readOnly && !isGuest && (
          <label className="visibility-toggle">
            <select
              value={activeNote.visibility}
              onChange={(e) =>
                setActiveVisibility(e.target.value as 'public' | 'private')
              }
            >
              <option value="private">🔒 仅我</option>
              <option value="public">🌐 公开</option>
            </select>
          </label>
        )}
      </div>
      {activeNote.summary && (
        <div className="ai-summary">
          <strong>AI 摘要：</strong> {activeNote.summary}
        </div>
      )}
      <BlockEditor
        blocks={activeNote.blocks}
        onChange={updateActiveBlocks}
        readOnly={readOnly}
      />
    </main>
  );
}
