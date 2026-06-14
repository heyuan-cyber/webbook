import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { TreeSidebar } from '@/components/TreeSidebar';
import type { AIStrategy, PublicFeedItem, SystemSettings } from '@webbook/shared';
import { apiClient } from '@/lib/api';
import { toast } from '@/store/useToastStore';

type Tab = 'tree' | 'public' | 'ai' | 'users' | 'settings';

function adminApiError(fallback: string) {
  return (err: unknown) => {
    const is401 = err instanceof Error && /\b401\b/.test(err.message);
    toast(
      'error',
      is401
        ? '管理员 API 权限不足：请确认 Worker 已配置 ADMIN_EMAIL（与 VITE_ADMIN_EMAIL 一致）'
        : fallback,
    );
  };
}

export function AdminPanel() {
  const { isAdmin, isGuest, session } = useAuth();
  const [tab, setTab] = useState<Tab>('tree');

  if (isGuest || !isAdmin) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>需要管理员权限</h1>
          <p className="muted">
            {isGuest ? '请先登录管理员账号。' : '当前账号不是管理员。'}
          </p>
          <Link className="btn btn-primary" to="/login">
            前往登录
          </Link>
          <Link className="btn btn-ghost" to="/app">
            返回用户端
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="admin">
      <header className="admin-top">
        <span className="logo">🛠 WebBook 管理后台</span>
        <span className="muted">{session?.email}</span>
        <Link className="btn btn-ghost" to="/app">
          → 用户端
        </Link>
      </header>
      <div className="admin-body">
        <nav className="admin-nav">
          <button className={tab === 'tree' ? 'active' : ''} onClick={() => setTab('tree')}>
            目录管理
          </button>
          <button className={tab === 'public' ? 'active' : ''} onClick={() => setTab('public')}>
            公开内容
          </button>
          <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>
            AI 策略
          </button>
          <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
            用户管理
          </button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
            系统设置
          </button>
        </nav>
        <section className="admin-content">
          {tab === 'tree' && (
            <div className="admin-tree-wrap">
              <h2>目录管理</h2>
              <p className="muted">在此创建 / 重命名 / 移动 / 删除栏目与笔记。</p>
              <TreeSidebar editable />
            </div>
          )}
          {tab === 'public' && session?.token && <PublicContentPanel token={session.token} />}
          {tab === 'ai' && session?.token && <AIStrategyPanel token={session.token} />}
          {tab === 'users' && session?.token && <UsersPanel token={session.token} />}
          {tab === 'settings' && session?.token && <SettingsPanel token={session.token} />}
        </section>
      </div>
    </div>
  );
}

function PublicContentPanel({ token }: { token: string }) {
  const [posts, setPosts] = useState<PublicFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    const res = await apiClient.adminPublicNotes(token);
    setPosts(res.posts);
  }

  useEffect(() => {
    void reload()
      .catch(adminApiError('加载公开内容失败'))
      .finally(() => setLoading(false));
  }, [token]);

  async function makePrivate(post: PublicFeedItem) {
    const key = `${post.ownerId}:${post.noteId}`;
    if (!window.confirm(`将「${post.title}」设为私密？将从博客广场下架。`)) return;
    setBusyId(key);
    try {
      await apiClient.adminSetNoteVisibility(token, post.ownerId, post.noteId, 'private');
      toast('success', '已设为私密');
      await reload();
    } catch {
      toast('error', '操作失败');
    } finally {
      setBusyId(null);
    }
  }

  async function removePost(post: PublicFeedItem) {
    const key = `${post.ownerId}:${post.noteId}`;
    if (
      !window.confirm(
        `确定删除「${post.title}」？将永久移除笔记文件与作者目录中的条目（Git 历史可找回）。`,
      )
    ) {
      return;
    }
    setBusyId(key);
    try {
      await apiClient.adminDeleteNote(token, post.ownerId, post.noteId);
      toast('success', '已删除');
      await reload();
    } catch {
      toast('error', '删除失败');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="muted">加载中…</p>;

  return (
    <div>
      <h2>公开内容审核</h2>
      <p className="muted">
        全站完全公开（public）的博客文章。可下架为私密或删除。圈子可见（circle）不在此列表。
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>标题</th>
            <th>作者</th>
            <th>更新</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {posts.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                暂无公开文章
              </td>
            </tr>
          )}
          {posts.map((post) => {
            const key = `${post.ownerId}:${post.noteId}`;
            const busy = busyId === key;
            return (
              <tr key={key}>
                <td>
                  <strong>{post.title}</strong>
                  {post.summary && <div className="muted">{post.summary}</div>}
                </td>
                <td>{post.ownerEmail}</td>
                <td className="muted">
                  {post.updatedAt ? new Date(post.updatedAt).toLocaleString() : '—'}
                </td>
                <td className="admin-actions-cell">
                  <Link
                    to={`/blog/${post.ownerId}/${post.noteId}`}
                    className="btn btn-ghost btn-sm"
                    target="_blank"
                    rel="noreferrer"
                  >
                    预览
                  </Link>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => void makePrivate(post)}
                  >
                    设为私密
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => void removePost(post)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AIStrategyPanel({ token }: { token: string }) {
  const [strategies, setStrategies] = useState<AIStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void apiClient
      .adminLoadAiStrategies(token)
      .then((res) => setStrategies(res.strategies))
      .catch(adminApiError('加载策略失败'))
      .finally(() => setLoading(false));
  }, [token]);

  function toggle(id: string) {
    setStrategies((list) =>
      list.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    );
  }

  async function save() {
    setSaving(true);
    try {
      await apiClient.adminSaveAiStrategies(token, { schemaVersion: 1, strategies });
      toast('success', '策略已保存');
    } catch {
      toast('error', '保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">加载中…</p>;

  return (
    <div>
      <h2>AI 策略</h2>
      <p className="muted">
        触发器 × 动作的可配置流水线。Cron 策略由 Workers 定时任务执行。
      </p>
      <div className="strategy-list">
        {strategies.map((s) => (
          <div className="strategy-card" key={s.id}>
            <div className="strategy-head">
              <strong>{s.name}</strong>
              <label className="switch">
                <input type="checkbox" checked={s.enabled} onChange={() => toggle(s.id)} />
                <span>{s.enabled ? '启用' : '停用'}</span>
              </label>
            </div>
            <div className="strategy-meta muted">
              触发：{s.trigger}
              {s.cron ? `（${s.cron}）` : ''} · 范围：{s.scope.kind} · 动作：
              {s.actions.join(', ')}
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-primary" disabled={saving} onClick={() => void save()}>
        {saving ? '保存中…' : '保存策略'}
      </button>
    </div>
  );
}

function UsersPanel({ token }: { token: string }) {
  const [users, setUsers] = useState<
    { id: string; email: string; updatedAt: string; disabled?: boolean }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiClient
      .adminUsers(token)
      .then((res) => setUsers(res.users))
      .catch(adminApiError('加载用户失败'))
      .finally(() => setLoading(false));
  }, [token]);

  async function setDisabled(userId: string, disabled: boolean) {
    try {
      const updated = await apiClient.adminSetUserDisabled(token, userId, disabled);
      setUsers((list) =>
        list.map((u) => (u.id === userId ? { ...u, disabled: updated.disabled } : u)),
      );
      toast('success', disabled ? '已停用' : '已启用');
    } catch {
      toast('error', '操作失败');
    }
  }

  if (loading) return <p className="muted">加载中…</p>;

  return (
    <div>
      <h2>用户管理</h2>
      <p className="muted">列出已注册用户，可启用 / 停用账号（停用后无法调用 API）。</p>
      <table className="data-table">
        <thead>
          <tr>
            <th>邮箱</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 && (
            <tr>
              <td colSpan={3} className="muted">
                暂无注册用户
              </td>
            </tr>
          )}
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.disabled ? '已停用' : '正常'}</td>
              <td>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void setDisabled(u.id, !u.disabled)}
                >
                  {u.disabled ? '启用' : '停用'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsPanel({ token }: { token: string }) {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void apiClient
      .adminLoadSettings(token)
      .then(setSettings)
      .catch(adminApiError('加载设置失败'))
      .finally(() => setLoading(false));
  }, [token]);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await apiClient.adminSaveSettings(token, settings);
      toast('success', '设置已保存到数据仓');
    } catch {
      toast('error', '保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) return <p className="muted">加载中…</p>;

  return (
    <div>
      <h2>系统设置</h2>
      <p className="muted">
        配置写入 GitHub 数据仓。Workers 运行时仍以 Cloudflare 环境变量为准；此处用于记录与对账。
      </p>
      <div className="settings-group">
        <h3>GitHub 仓库</h3>
        <label>
          仓库 (owner/repo)
          <input
            value={settings.githubRepo}
            onChange={(e) => setSettings({ ...settings, githubRepo: e.target.value })}
            placeholder="your-name/webbook-data"
          />
        </label>
        <label>
          分支
          <input
            value={settings.githubBranch}
            onChange={(e) => setSettings({ ...settings, githubBranch: e.target.value })}
          />
        </label>
      </div>
      <div className="settings-group">
        <h3>AI Provider</h3>
        <label>
          Provider
          <input
            value={settings.aiProvider}
            onChange={(e) => setSettings({ ...settings, aiProvider: e.target.value })}
          />
        </label>
        <label>
          Base URL
          <input
            value={settings.aiBaseUrl}
            onChange={(e) => setSettings({ ...settings, aiBaseUrl: e.target.value })}
          />
        </label>
        <label>
          Model
          <input
            value={settings.aiModel}
            onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
          />
        </label>
      </div>
      <button className="btn btn-primary" disabled={saving} onClick={() => void save()}>
        {saving ? '保存中…' : '保存设置'}
      </button>
    </div>
  );
}
