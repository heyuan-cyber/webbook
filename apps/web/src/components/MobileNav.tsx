import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useNotesStore } from '@/store/useNotesStore';
import { usePlanStore } from '@/store/usePlanStore';
import { Icon, type IconName } from '@/components/Icon';

/**
 * 移动端底部导航 + 悬浮新建（openspec 方向一 · 第二步第 3 项）。
 *
 * 为什么需要：原先 390px 下顶栏入口被挤掉，只剩「社区」；
 * 需求文档里 U-03「手机端快速新建笔记」也一直未实现
 * （现状要先打开抽屉目录、再点「+ 笔记」）。
 *
 * 只在 ≤720px 渲染；桌面端完全不受影响。
 * 底栏用 `env(safe-area-inset-bottom)` 适配全面屏 home indicator。
 */
export function MobileNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isGuest, session } = useAuth();
  const addNote = useNotesStore((s) => s.addNote);
  const selectNote = useNotesStore((s) => s.selectNote);
  const openPlanner = usePlanStore((s) => s.openPlanner);

  /** 当前位置归类到四个 tab 之一 */
  const path = location.pathname;
  const onNotes = path.startsWith('/app') && !path.startsWith('/app/circles');
  const onCommunity = path.startsWith('/app/circles');
  const tab = onNotes ? 'notes' : onCommunity ? 'community' : null;

  async function quickNewNote() {
    const id = await addNote(null, '新笔记');
    navigate(`/app/note/${id}`);
    void selectNote(id);
  }

  const items: { key: string; label: string; icon: IconName; active: boolean; onClick?: () => void; to?: string }[] = [
    { key: 'notes', label: '笔记', icon: 'book', active: tab === 'notes', to: '/app' },
    {
      key: 'tasks',
      label: '任务',
      icon: 'check-square',
      active: false,
      onClick: () => openPlanner({ kind: 'all' }),
    },
    { key: 'community', label: '社区', icon: 'globe', active: tab === 'community', to: '/blog' },
    {
      key: 'me',
      label: '我的',
      icon: 'user',
      active: false,
      // 游客去登录；登录用户直达自己的公开主页。
      // 注意用 `/blog/u/:userId` 而不是 `/blog/me` —— 后者会重定向回 /blog，点了像没反应。
      to: isGuest || !session?.userId ? '/login' : `/blog/u/${session.userId}`,
    },
  ];

  return (
    <>
      {tab === 'notes' && (
        <button type="button" className="m-fab" aria-label="新建笔记" onClick={quickNewNote}>
          <Icon name="plus" size={24} />
        </button>
      )}
      <nav className="m-nav" aria-label="主导航">
        {items.map((it) => {
          const cls = `m-nav-item ${it.active ? 'is-on' : ''}`;
          return it.to ? (
            <button
              key={it.key}
              type="button"
              className={cls}
              aria-current={it.active ? 'page' : undefined}
              onClick={() => navigate(it.to!)}
            >
              <Icon name={it.icon} size={20} />
              {it.label}
            </button>
          ) : (
            <button key={it.key} type="button" className={cls} onClick={it.onClick}>
              <Icon name={it.icon} size={20} />
              {it.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
