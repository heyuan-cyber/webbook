import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import type { Block } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useNotesStore } from '@/store/useNotesStore';
import { BlockEditor } from './editor/BlockEditor';
import { AiChatPanel } from './AiChatPanel';
import { NoteHistoryPanel } from './NoteHistoryPanel';
import { toast } from '@/store/useToastStore';

export function NoteEditor({ readOnly = false }: { readOnly?: boolean }) {
  const { id } = useParams();
  const { session, isGuest } = useAuth();
  const isMobile = useIsMobile();
  const activeNote = useNotesStore((s) => s.activeNote);
  const treeReady = useNotesStore((s) => s.treeReady);
  const treeLoading = useNotesStore((s) => s.treeLoading);
  const noteLoading = useNotesStore((s) => s.noteLoading);
  const selectNote = useNotesStore((s) => s.selectNote);
  const setActiveTitle = useNotesStore((s) => s.setActiveTitle);
  const setActiveVisibility = useNotesStore((s) => s.setActiveVisibility);
  const updateActiveBlocks = useNotesStore((s) => s.updateActiveBlocks);
  const saving = useNotesStore((s) => s.saving);
  const saveError = useNotesStore((s) => s.saveError);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!id || !treeReady) return;
    void selectNote(id);
  }, [id, treeReady, selectNote]);

  useEffect(() => {
    setPreview(false);
  }, [id]);

  if (!id) {
    return (
      <main className="editor empty">
        <div className="empty-state">
          <h2>欢迎使用 WebBook</h2>
          <p className="muted">
            {isMobile
              ? '点左上角 ☰ 打开目录，选择或新建一篇笔记。'
              : '从左侧选择或新建一篇笔记开始记录。'}
          </p>
        </div>
      </main>
    );
  }

  if (!activeNote) {
    return (
      <main className="editor">
        <div className="loading-state">
          <span className="spinner" aria-hidden />
          <p className="muted">
            {treeLoading || noteLoading ? '加载笔记…' : '未找到笔记'}
          </p>
        </div>
      </main>
    );
  }

  const showPreview = readOnly || preview;

  function isNoteEffectivelyEmpty(blocks: Block[]): boolean {
    if (blocks.length !== 1) return false;
    const only = blocks[0];
    return only.type === 'paragraph' && !only.text.trim();
  }

  function applyAiBlocks(blocks: Block[], mode: 'replace' | 'append') {
    if (!activeNote || !blocks.length) return;
    if (mode === 'replace') {
      updateActiveBlocks(blocks);
      toast('success', '已替换笔记内容');
      return;
    }
    const base = isNoteEffectivelyEmpty(activeNote.blocks) ? [] : activeNote.blocks;
    updateActiveBlocks([...base, ...blocks]);
    toast('success', '已追加到笔记末尾');
  }

  return (
    <main className={`editor editor-with-ai ${showPreview ? 'editor-preview' : ''}`}>
      <div className="editor-head">
        {showPreview ? (
          <h1 className="note-title">{activeNote.title}</h1>
        ) : (
          <input
            className="note-title-input"
            value={activeNote.title}
            onChange={(e) => setActiveTitle(e.target.value)}
            placeholder="笔记标题"
          />
        )}
        <span className={`save-state muted ${saveError ? 'save-err' : ''}`}>
          {saving ? '保存中…' : saveError ? '本地已存' : '已保存'}
        </span>
        {!readOnly && (
          <button
            type="button"
            className={`btn btn-ghost ${preview ? 'active' : ''}`}
            onClick={() => setPreview((p) => !p)}
          >
            {preview ? '编辑' : '预览'}
          </button>
        )}
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
        {activeNote.visibility === 'public' && (
          <Link
            className="btn btn-ghost"
            to={
              session?.userId
                ? `/blog/${session.userId}/${activeNote.id}`
                : `/blog/${activeNote.id}`
            }
            target="_blank"
          >
            博客预览
          </Link>
        )}
        {!readOnly && (
          <NoteHistoryPanel
            noteId={activeNote.id}
            onRestore={(note) => {
              setActiveTitle(note.title);
              updateActiveBlocks(note.blocks);
            }}
          />
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
        readOnly={showPreview}
      />
      {!readOnly && (
        <AiChatPanel
          note={activeNote}
          disabled={showPreview}
          onApplyBlocks={applyAiBlocks}
        />
      )}
    </main>
  );
}
