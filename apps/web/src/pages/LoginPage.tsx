import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { localStore } from '@/lib/storage';
import { apiClient } from '@/lib/api';
import { supabase } from '@/auth/supabaseProvider';

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // 登录前检测本地游客草稿，提示合并
      const ids = await localStore.allNoteIds();
      if (mode === 'up') await signUp(email, password);
      else await signIn(email, password);

      if (ids.length > 0) {
        const merge = window.confirm(
          `检测到 ${ids.length} 篇本地草稿，登录后是否上传并保存到云端？`,
        );
        if (merge) {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (token) {
            for (const id of ids) {
              const note = await localStore.loadNote(id);
              if (note) await apiClient.saveNote(note, token);
            }
            const localTree = await localStore.loadTree();
            if (localTree.roots.length > 0) {
              await apiClient.saveTree(localTree, token);
            }
            // 本地 tree 为空时不覆盖云端（避免冲掉 legacy 目录）
          }
        }
      }
      navigate('/app');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>📓 WebBook</h1>
        <p className="muted">{mode === 'in' ? '登录以同步你的笔记' : '注册新账号'}</p>
        <input
          type="email"
          placeholder="邮箱"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="密码"
          value={password}
          required
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="auth-error">{error}</div>}
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? '处理中…' : mode === 'in' ? '登录' : '注册'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setMode((m) => (m === 'in' ? 'up' : 'in'))}
        >
          {mode === 'in' ? '没有账号？注册' : '已有账号？登录'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/app')}>
          以游客身份继续
        </button>
        <p className="auth-note muted">
          使用邮箱注册/登录。若 Supabase 开启了邮箱验证，请先查收验证邮件。
        </p>
      </form>
    </div>
  );
}
