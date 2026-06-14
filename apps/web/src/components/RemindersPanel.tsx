import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Reminder } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiClient } from '@/lib/api';
import { toast } from '@/store/useToastStore';

export function RemindersPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session, isGuest } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [quickText, setQuickText] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const res = await apiClient.loadReminders(session.token);
      setReminders(res.reminders);
    } catch {
      toast('error', '无法加载提醒');
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useEffect(() => {
    if (open && !isGuest && session?.token) void load();
  }, [open, isGuest, session?.token, load]);

  async function toggleDone(id: string, done: boolean) {
    if (!session?.token) return;
    try {
      const updated = await apiClient.patchReminder(session.token, id, { done });
      setReminders((list) => list.map((r) => (r.id === id ? updated : r)));
    } catch {
      toast('error', '更新失败');
    }
  }

  async function quickAdd() {
    if (!session?.token || !quickText.trim()) return;
    try {
      const created = await apiClient.addQuickReminder(session.token, quickText.trim());
      setReminders((list) => [created, ...list]);
      setQuickText('');
      toast('success', '已记下');
    } catch {
      toast('error', '保存失败');
    }
  }

  if (!open) return null;

  return (
    <div className="reminders-panel" role="dialog" aria-label="提醒与快记">
      <div className="reminders-panel-head">
        <h2>提醒 / 快记</h2>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          关闭
        </button>
      </div>
      {isGuest ? (
        <p className="muted">
          <Link to="/login">登录</Link> 后使用提醒与快记。
        </p>
      ) : (
        <>
          <div className="reminders-quick">
            <input
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              placeholder="随手记下一件事…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void quickAdd();
              }}
            />
            <button type="button" className="btn btn-primary" onClick={() => void quickAdd()}>
              快记
            </button>
          </div>
          {loading && <p className="muted">加载中…</p>}
          <ul className="reminders-list">
            {reminders.map((r) => (
              <li key={r.id} className={r.done ? 'done' : ''}>
                <label>
                  <input
                    type="checkbox"
                    checked={r.done}
                    onChange={(e) => void toggleDone(r.id, e.target.checked)}
                  />
                  <span>{r.text}</span>
                </label>
                {r.noteId !== '__quick__' && (
                  <Link className="muted reminders-note-link" to={`/app/note/${r.noteId}`}>
                    来源笔记
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {!loading && reminders.length === 0 && (
            <p className="muted">暂无提醒。笔记里的待办块保存后会自动出现在这里。</p>
          )}
        </>
      )}
    </div>
  );
}
