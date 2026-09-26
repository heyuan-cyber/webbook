import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Icon } from '@/components/Icon';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';

/**
 * 账号菜单（openspec 方向一 · 第二步：顶栏收敛）。
 *
 * 原先顶栏把 7 个入口平铺成一行 ghost 按钮；现在收纳为一个账号/导航下拉，
 * 低频入口进菜单，顶栏只留面包屑 + 命令栏 + 本菜单。游客态则是单纯的「登录」按钮。
 *
 * 两个已修的坑：
 *   1. **被下方内容遮挡**：`.topbar` 带 `backdrop-filter` 会强制产生层叠上下文，
 *      菜单的 `z-index:40` 被锁在里头，盖不过顶栏之下的笔记本正文。
 *      改用 **portal 渲染到 body**，彻底脱离该上下文；位置由触发按钮的
 *      `getBoundingClientRect()` 算出，用 `position: fixed` 贴合。
 *   2. **矮窗口下溢出屏幕**：菜单自身约 398px 高，原先没有 `max-height`，
 *      视口高低于约 500px 时底部会被切掉。现在按可用空间限高并允许滚动。
 */
export function AccountMenu() {
  const { session, isGuest, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number; maxH: number } | null>(null);

  // 计算菜单位置与可用高度（贴合触发按钮，并在视口内限高）
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = rootRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const GAP = 8;
    const top = r.bottom + GAP;
    const right = Math.max(8, window.innerWidth - r.right);
    // 至少留 120px 可用，避免极矮窗口下贴到 0
    const maxH = Math.max(120, window.innerHeight - top - 12);
    setPos({ top, right, maxH });
  }, [open]);

  // 点击外部 / Esc 关闭（菜单已 portal 出去，需同时判断锚点与菜单）
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    // 窗口尺寸变化时重新定位，避免菜单悬空或出界
    function onReflow() {
      const anchor = rootRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const top = r.bottom + 8;
      setPos({
        top,
        right: Math.max(8, window.innerWidth - r.right),
        maxH: Math.max(120, window.innerHeight - top - 12),
      });
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
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

  const menu = open && pos && (
    <div
      className="acct-menu"
      role="menu"
      ref={menuRef}
      style={{ top: pos.top, right: pos.right, maxHeight: pos.maxH }}
    >
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
  );

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
      {/* portal 到 body：脱离 .topbar 的层叠上下文，才能盖住下方正文 */}
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
