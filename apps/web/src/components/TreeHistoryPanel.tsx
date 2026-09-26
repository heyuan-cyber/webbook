import { useEffect, useState } from 'react';
import type { NoteTree } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiClient } from '@/lib/api';
import { useNotesStore } from '@/store/useNotesStore';
import { toast } from '@/store/useToastStore';
import { Icon } from '@/components/Icon';

interface TreeVersion {
  sha: string;
  date: string;
  message: string;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 目录规模摘要，用于在恢复前让用户确认"这一版有多少东西" */
function summarize(tree: NoteTree): string {
  let folders = 0;
  let notes = 0;
  (function walk(nodes: NoteTree['roots']) {
    for (const n of nodes) {
      if (n.kind === 'folder') folders += 1;
      else notes += 1;
      if (n.children) walk(n.children);
    }
  })(tree.roots);
  return `${folders} 个栏目 · ${notes} 篇笔记`;
}

function rootTitles(tree: NoteTree): string {
  return tree.roots.map((n) => n.title).filter(Boolean).join(' / ');
}

/**
 * 目录树版本历史与恢复。
 *
 * 存在意义：2026-09-26 的整树覆盖事故只能靠 git 手工抢救，有了这个面板用户自己就能回滚。
 * 恢复走的是普通条件写（带当前 revision），因此不会覆盖别人的并发写入。
 */
export function TreeHistoryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useAuth();
  const restoreTreeVersion = useNotesStore((s) => s.restoreTreeVersion);
  const [versions, setVersions] = useState<TreeVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ sha: string; tree: NoteTree } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !session?.token) return;
    setLoading(true);
    setPreview(null);
    void apiClient
      .treeHistory(session.token)
      .then((res) => setVersions(res.versions))
      .catch(() => toast('error', '加载目录历史失败'))
      .finally(() => setLoading(false));
  }, [open, session?.token]);

  async function openPreview(sha: string) {
    if (!session?.token) return;
    setBusy(sha);
    try {
      const tree = await apiClient.treeVersion(sha, session.token);
      setPreview({ sha, tree });
    } catch {
      toast('error', '读取该版本失败');
    } finally {
      setBusy(null);
    }
  }

  async function restore(sha: string) {
    if (!session?.token) return;
    if (
      !window.confirm(
        '恢复此版本目录？当前目录结构会被替换（笔记正文不受影响，不会删除任何笔记文件）。',
      )
    ) {
      return;
    }
    setBusy(sha);
    try {
      const tree =
        preview?.sha === sha ? preview.tree : await apiClient.treeVersion(sha, session.token);
      await restoreTreeVersion(tree);
      onClose();
    } catch {
      toast('error', '恢复失败');
    } finally {
      setBusy(null);
    }
  }

  if (!open) return null;

  return (
    <div className="tree-hist-backdrop" onClick={onClose}>
      <div className="tree-hist" onClick={(e) => e.stopPropagation()}>
        <header className="tree-hist-head">
          <h2>目录历史</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="关闭目录历史"
            onClick={onClose}
          >
            <Icon name="x" size={14} />
          </button>
        </header>
        <p className="tree-hist-hint muted">
          每次目录结构变更都会留下一个版本。恢复只改变目录结构，不会删除笔记文件。
        </p>
        {loading && <p className="muted">加载中…</p>}
        {!loading && versions.length === 0 && <p className="muted">还没有目录历史。</p>}
        <ol className="tree-hist-list">
          {versions.map((v) => (
            <li key={v.sha} className={`tree-hist-item ${preview?.sha === v.sha ? 'is-open' : ''}`}>
              <div className="tree-hist-row">
                <span className="tree-hist-when">{formatWhen(v.date)}</span>
                <span className="tree-hist-sha muted">{v.sha.slice(0, 7)}</span>
                <span className="tree-hist-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy === v.sha}
                    onClick={() => void openPreview(v.sha)}
                  >
                    预览
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busy === v.sha}
                    onClick={() => void restore(v.sha)}
                  >
                    恢复
                  </button>
                </span>
              </div>
              {preview?.sha === v.sha && (
                <div className="tree-hist-preview">
                  <div className="muted">{summarize(preview.tree)}</div>
                  <div className="tree-hist-roots">{rootTitles(preview.tree) || '（空目录）'}</div>
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
