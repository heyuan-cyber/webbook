import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { TreeSidebar } from '@/components/TreeSidebar';
import type { AIStrategy } from '@webbook/shared';

type Tab = 'tree' | 'ai' | 'users' | 'settings';

const DEFAULT_STRATEGIES: AIStrategy[] = [
  {
    id: 'on-save-summary',
    name: '写完即总结',
    enabled: false,
    trigger: 'on_save',
    scope: { kind: 'note' },
    actions: ['summarize'],
  },
  {
    id: 'nightly-tidy',
    name: '每晚整理 + TODO 提取',
    enabled: true,
    trigger: 'cron',
    cron: '0 2 * * *',
    scope: { kind: 'all' },
    actions: ['classify', 'extract_todos'],
  },
];

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
          {tab === 'ai' && <AIStrategyPanel />}
          {tab === 'users' && <UsersPanel />}
          {tab === 'settings' && <SettingsPanel />}
        </section>
      </div>
    </div>
  );
}

function AIStrategyPanel() {
  const [strategies, setStrategies] = useState<AIStrategy[]>(DEFAULT_STRATEGIES);

  function toggle(id: string) {
    setStrategies((list) =>
      list.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    );
  }

  return (
    <div>
      <h2>AI 策略</h2>
      <p className="muted">
        触发器 × 动作的可配置流水线。Provider / API Key 在「系统设置」中配置，仅存服务端。
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
      <button className="btn" disabled title="后续接入：新增策略">
        + 新增策略（待接入后端）
      </button>
    </div>
  );
}

function UsersPanel() {
  return (
    <div>
      <h2>用户管理</h2>
      <p className="muted">列出注册用户、查看角色、启用 / 停用账号。</p>
      <table className="data-table">
        <thead>
          <tr>
            <th>邮箱</th>
            <th>角色</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={4} className="muted">
              （接入 Supabase 后展示真实用户列表）
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SettingsPanel() {
  return (
    <div>
      <h2>系统设置</h2>
      <div className="settings-group">
        <h3>GitHub 仓库</h3>
        <label>
          仓库 (owner/repo)
          <input placeholder="your-name/webbook-data" />
        </label>
        <label>
          分支
          <input placeholder="main" defaultValue="main" />
        </label>
        <p className="muted">Token 存于 Workers Secrets，不在前端保存。</p>
      </div>
      <div className="settings-group">
        <h3>AI Provider</h3>
        <label>
          Provider
          <input placeholder="deepseek" defaultValue="deepseek" />
        </label>
        <label>
          Base URL
          <input placeholder="https://api.deepseek.com" />
        </label>
        <label>
          Model
          <input placeholder="deepseek-chat" />
        </label>
        <p className="muted">API Key 仅在服务端配置。</p>
      </div>
      <button className="btn btn-primary" disabled title="后续接入后端保存">
        保存（待接入后端）
      </button>
    </div>
  );
}
