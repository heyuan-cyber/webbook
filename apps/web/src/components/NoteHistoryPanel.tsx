import { useEffect, useState } from 'react';
import type { Note } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiClient } from '@/lib/api';
import { BlockEditor } from './editor/BlockEditor';
import { toast } from '@/store/useToastStore';

interface Commit {
  sha: string;
  message: string;
  date: string;
}

export function NoteHistoryPanel({
  noteId,
  onRestore,
}: {
  noteId: string;
  onRestore: (note: Note) => void;
}) {
  const { session, isGuest } = useAuth();
  const [open, setOpen] = useState(false);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Note | null>(null);
  const [previewSha, setPreviewSha] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!open || isGuest || !session?.token) return;
    setLoading(true);
    void apiClient
      .history(noteId, session.token)
      .then((res) => setCommits(res.commits))
      .catch(() => toast('error', '加载历史版本失败'))
      .finally(() => setLoading(false));
  }, [open, noteId, isGuest, session?.token]);

  if (isGuest || !session?.token) return null;

  async function loadVersion(sha: string) {
    if (!session?.token) return;
    setPreviewLoading(true);
    setPreviewSha(sha);
    try {
      const note = await apiClient.noteVersion(noteId, sha, session.token);
      setPreview(note);
    } catch {
      toast('error', '加载该版本失败');
      setPreview(null);
      setPreviewSha(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  function closePreview() {
    setPreview(null);
    setPreviewSha(null);
  }

  function restore() {
    if (!preview) return;
    onRestore(preview);
    toast('success', '已恢复所选版本');
    closePreview();
    setOpen(false);
  }

  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen((v) => !v)}>
        历史
      </button>
      {open && (
        <div className="history-panel">
          <div className="history-head">
            <strong>版本历史</strong>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              关闭
            </button>
          </div>
          {loading && <p className="muted">加载中…</p>}
          {!loading && commits.length === 0 && (
            <p className="muted">暂无云端历史（需登录并同步到 GitHub）</p>
          )}
          <ul className="history-list">
            {commits.map((c) => (
              <li key={c.sha}>
                <button
                  type="button"
                  className={`history-item ${previewSha === c.sha ? 'active' : ''}`}
                  onClick={() => void loadVersion(c.sha)}
                >
                  <span className="history-date">{formatDate(c.date)}</span>
                  <span className="history-msg">{c.message}</span>
                  <span className="history-sha muted">{c.sha.slice(0, 7)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview && (
        <div className="history-modal-backdrop" onClick={closePreview}>
          <div className="history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="history-modal-head">
              <strong>历史预览</strong>
              <div className="history-modal-actions">
                <button type="button" className="btn btn-primary" onClick={restore}>
                  恢复此版本
                </button>
                <button type="button" className="btn btn-ghost" onClick={closePreview}>
                  关闭
                </button>
              </div>
            </div>
            {previewLoading ? (
              <p className="muted">加载中…</p>
            ) : (
              <BlockEditor blocks={preview.blocks} onChange={() => {}} readOnly />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
