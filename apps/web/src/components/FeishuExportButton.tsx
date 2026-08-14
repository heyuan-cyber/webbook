import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { apiClient } from '@/lib/api';
import { collectFeishuExportPayload } from '@/lib/feishuZipIo';
import { useNotesStore } from '@/store/useNotesStore';
import { toast } from '@/store/useToastStore';

const LAST_FOLDER_KEY = 'webbook:feishu:lastFolderToken';
const RESUME_EXPORT_KEY = 'webbook:feishu:resumeExport';

/**
 * 导出当前笔记到飞书「我的空间」：OAuth → 选目录 → 写入 docx。
 */
export function FeishuExportButton() {
  const { session, isGuest } = useAuth();
  const activeNote = useNotesStore((s) => s.activeNote);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [folders, setFolders] = useState<{ token: string; name: string }[]>([]);
  const [parent, setParent] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_FOLDER_KEY);
    } catch {
      return null;
    }
  });
  const [stack, setStack] = useState<{ token: string | null; name: string }[]>([
    { token: null, name: '云空间根目录' },
  ]);

  useEffect(() => {
    if (!open || !session?.token) return;
    void (async () => {
      try {
        const data = await apiClient.feishuFolders(session.token, parent);
        setFolders(data.folders);
        if (data.lastFolderToken && selected == null) {
          setSelected(data.lastFolderToken);
        }
      } catch (e) {
        toast('error', (e as Error).message || '无法列出飞书目录');
      }
    })();
  }, [open, session?.token, parent, selected]);

  /** OAuth 全页跳转回来后自动打开目录选择 */
  useEffect(() => {
    if (isGuest || !session?.token) return;
    let wantResume = false;
    try {
      wantResume = sessionStorage.getItem(RESUME_EXPORT_KEY) === '1';
    } catch {
      return;
    }
    if (!wantResume) return;
    void (async () => {
      try {
        const st = await apiClient.feishuStatus(session.token);
        if (!st.bound) return;
        try {
          sessionStorage.removeItem(RESUME_EXPORT_KEY);
        } catch {
          /* ignore */
        }
        setOpen(true);
        toast('success', '飞书已绑定，请选择导出目录');
      } catch {
        /* ignore — 用户可再点导出 */
      }
    })();
  }, [session?.token, isGuest]);

  function currentNote() {
    return activeNote ?? useNotesStore.getState().activeNote;
  }

  async function ensureBound(): Promise<boolean> {
    if (!session?.token) return false;
    const st = await apiClient.feishuStatus(session.token);
    if (!st.configured) {
      toast('error', '服务端未配置飞书应用');
      return false;
    }
    // needsReauth（旧 token 缺 convert scope）时 bound=false，会走下方授权
    if (st.bound && !st.needsReauth) return true;
    if (st.needsReauth) {
      toast('info', '飞书权限已更新，需要重新授权（含「转换为文档块」）');
    }
    try {
      sessionStorage.setItem(RESUME_EXPORT_KEY, '1');
    } catch {
      /* ignore */
    }
    const { url } = await apiClient.feishuOAuthStart(session.token, window.location.href);
    window.location.href = url;
    return false;
  }

  async function reauthorizeFeishu() {
    if (!session?.token) return;
    setBusy(true);
    try {
      await apiClient.feishuOAuthUnbind(session.token);
      try {
        sessionStorage.setItem(RESUME_EXPORT_KEY, '1');
      } catch {
        /* ignore */
      }
      const { url } = await apiClient.feishuOAuthStart(session.token, window.location.href);
      window.location.href = url;
    } catch (e) {
      toast('error', (e as Error).message || '重新授权失败');
      setBusy(false);
    }
  }

  async function onClickExport() {
    if (isGuest || !session?.token) {
      toast('error', '请先登录后再导出到飞书');
      return;
    }
    if (!currentNote()) {
      toast('error', '请先打开一篇笔记');
      return;
    }
    setBusy(true);
    try {
      const ok = await ensureBound();
      if (!ok) return;
      setOpen(true);
    } catch (e) {
      toast('error', (e as Error).message || '飞书授权失败');
    } finally {
      setBusy(false);
    }
  }

  async function confirmExport() {
    const note = currentNote();
    if (!session?.token || !note) {
      toast('error', '请先打开一篇笔记');
      return;
    }
    setBusy(true);
    try {
      const payload = await collectFeishuExportPayload(note);
      const result = await apiClient.feishuExport(session.token, {
        title: payload.title,
        markdown: payload.markdown,
        folder_token: selected,
        files: payload.files,
      });
      try {
        if (selected) localStorage.setItem(LAST_FOLDER_KEY, selected);
        else localStorage.removeItem(LAST_FOLDER_KEY);
      } catch {
        /* ignore */
      }
      setOpen(false);
      if (result.warnings?.length) {
        toast('error', `已导出，但有 ${result.warnings.length} 条媒体警告`);
      } else {
        toast('success', '已导出到飞书');
      }
      if (result.url) window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      const err = e as Error & { needsReauth?: boolean };
      toast('error', err.message || '导出失败');
      if (err.needsReauth) {
        toast('info', '可点弹窗内「重新授权飞书」后再导出');
      }
    } finally {
      setBusy(false);
    }
  }

  function enterFolder(token: string, name: string) {
    setStack((s) => [...s, { token, name }]);
    setParent(token);
    setSelected(token);
  }

  function goUp() {
    if (stack.length <= 1) return;
    const next = stack.slice(0, -1);
    setStack(next);
    const top = next[next.length - 1];
    setParent(top.token);
    setSelected(top.token);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={busy}
        onClick={() => void onClickExport()}
        title="导出到飞书文档（我的空间）"
      >
        {busy ? '…' : '导出到飞书'}
      </button>
      {open && (
        <div className="feishu-export-modal" role="dialog" aria-modal="true">
          <div className="feishu-export-card">
            <h3>选择飞书目录</h3>
            <p className="muted">文档将写入你的飞书云空间</p>
            <div className="feishu-export-path">
              {stack.map((s) => s.name).join(' / ')}
            </div>
            <div className="feishu-export-list">
              <label className="feishu-export-item">
                <input
                  type="radio"
                  name="feishu-folder"
                  checked={selected === parent}
                  onChange={() => setSelected(parent)}
                />
                <span>当前目录（{stack[stack.length - 1]?.name ?? '根'}）</span>
              </label>
              {folders.map((f) => (
                <div key={f.token} className="feishu-export-row">
                  <label className="feishu-export-item">
                    <input
                      type="radio"
                      name="feishu-folder"
                      checked={selected === f.token}
                      onChange={() => setSelected(f.token)}
                    />
                    <span>📁 {f.name}</span>
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => enterFolder(f.token, f.name)}
                  >
                    进入
                  </button>
                </div>
              ))}
            </div>
            <div className="feishu-export-actions">
              <button type="button" className="btn btn-ghost" disabled={stack.length <= 1} onClick={goUp}>
                上级
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => void reauthorizeFeishu()}
                title="解除绑定并用含 convert 权限的新 scope 重新授权"
              >
                重新授权飞书
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void confirmExport()}
              >
                {busy ? '导出中…' : '确认导出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
