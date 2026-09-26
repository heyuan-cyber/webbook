import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Icon } from '@/components/Icon';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';

/**
 * 账号菜单（openspec 方向一 · 第二步：顶栏收敛）。
 *
 * 原先顶栏把 7 个入口平铺成一行 ghost 按钮：
 *   社区 · 个人主页 · 任务 · 圈子 · 后台 · 退出 ·[登录]
 * 问题是：没有主次（7 个视觉权重相同的按钮）、没有 active 态、
 * 窄屏靠 `flex-wrap` 折成两行且高度不齐、390px 手机上只剩「社区」、
 * 且「后台」对游客也显示（点进去只得到一张权限卡片）。
 *
 * 现在收纳为一个账号/导航下拉：低频入口进菜单，顶栏只留面包屑 + 命令栏 + 本菜单。
 * 游客态则是单纯的「登录」按钮，不展示任何需要登录的入口。
 */
export function AccountMenu() {
  const { session, isGuest, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 游客：只给登录入口，不再展示「后台」等需要鉴权的项
  if (isGuest) {
    return (
      <Link className="btn btn-primary" to="/login">
        登录
      </Link>
    );
  }

  const email = session?.email ?? '';
  const initial = (email.split('@')[0] || '?').slice(0, 1).toUpperCase();

  return (
    <div className="acct" ref={rootRef}>
      <button
        type="button"
        className="acct-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`账号菜单：${email}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="acct-avatar" aria-hidden="true">
          {initial}
        </span>
      </button>

      {open && (
        <div className="acct-menu" role="menu">
          <div className="acct-head">
            <span className="acct-avatar" aria-hidden="true">
              {initial}
            </span>
            <div className="acct-head-text">
              <strong>{email}</strong>
              <span className="muted">{isAdmin ? '管理员' : '普通用户'}</span>
            </div>
          </div>

          <div className="acct-sep" />

          <Link className="acct-item" role="menuitem" to={`/blog/u/${session?.userId}`} onClick={() => setOpen(false)}>
            <Icon name="user" size={14} />
            个人主页
          </Link>
          <Link className="acct-item" role="menuitem" to="/blog" onClick={() => setOpen(false)}>
            <Icon name="globe" size={14} />
            社区
          </Link>
          <Link className="acct-item" role="menuitem" to="/app/circles" onClick={() => setOpen(false)}>
            <Icon name="users" size={14} />
            圈子
          </Link>

          {/* 「后台」只对管理员显示 —— 原先对游客也渲染，点进去只是权限卡片 */}
          {isAdmin && (
            <>
              <div className="acct-sep" />
              <Link className="acct-item" role="menuitem" to="/admin" onClick={() => setOpen(false)}>
                <Icon name="settings" size={14} />
                管理后台
              </Link>
            </>
          )}

          <div className="acct-sep" />

          <div className="acct-block">
            <span className="acct-block-label">
              <Icon name="layers" size={12} /> 页面皮肤
            </span>
            <ThemeSwitcher variant="menu" />
          </div>

          <div className="acct-sep" />

          <button
            type="button"
            className="acct-item acct-item-danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut();
              navigate('/login');
            }}
          >
            <Icon name="logout" size={14} />
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
