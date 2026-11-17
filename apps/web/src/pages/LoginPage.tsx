import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NoteTree } from '@webbook/shared';
import { mergeTreeById } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { localStore } from '@/lib/storage';
import { apiClient, TreeConflictError } from '@/lib/api';
import { supabase } from '@/auth/supabaseProvider';
import { useNotesStore } from '@/store/useNotesStore';
import { toast } from '@/store/useToastStore';
import { Icon } from '@/components/Icon';

/**
 * 登录时把本地游客目录并进云端：按节点 id 做并集，**绝不整树覆盖**。
 * 云端 revision 未知（旧版 Worker）时不写——宁可少同步一次，也不能让本地树变成权威。
 * 撞并发时重读重做一次（并集合并本身是幂等的）；仍失败则保留本地树，不覆盖云端。
 *
 * @returns 云端是否已经是"本地并入后"的树
 */
async function mergeLocalTreeIntoCloud(localTree: NoteTree, token: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const cloud = await apiClient.loadTree(token);
      if (!cloud.revReported) {
        toast('error', '云端目录版本未知，本地草稿目录暂未合并');
        return false;
      }
      const merged = mergeTreeById(cloud.tree, localTree);
      if (merged.stats.addedNodes === 0) return true;
      await apiClient.saveTree(merged.tree, cloud.rev, token);
      return true;
    } catch (e) {
      // 冲突：重读最新云端树再并一次；其它错误直接放弃（本地树仍是完整的）
      if (e instanceof TreeConflictError && attempt === 0) continue;
      if (e instanceof TreeConflictError) {
        toast('error', '云端目录刚被其他设备修改，本地草稿目录未覆盖云端');
      } else {
        toast('error', '本地草稿目录合并失败，可在应用内重新整理');
      }
      return false;
    }
  }
  return false;
}

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
      // 登录前先抓住游客草稿与游客目录：登录后 init 会用云端树刷新本机副本
      const ids = await localStore.allNoteIds();
      const guestTree = await localStore.loadTree();
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
            if (guestTree.roots.length > 0) {
              // 与云端按 id 并集合并（任务 5.1–5.3）；本地为空时不写，避免冲掉云端目录
              const merged = await mergeLocalTreeIntoCloud(guestTree, token);
              if (merged) {
                // 这次写入推进了云端 revision，刷新仓库里的副本，否则首次目录改动会撞 409。
                // 失败时不刷新：那会把未合并的游客目录从本机副本里抹掉。
                await useNotesStore.getState().refreshTree();
              }
            }
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
        <h1>
        <Icon name="book" size={24} /> WebBook
      </h1>
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
