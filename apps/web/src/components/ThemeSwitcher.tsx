import { useEffect, useRef, useState } from 'react';
import { THEME_META, useTheme } from '@/lib/theme';
import { Icon } from '@/components/Icon';

/**
 * 皮肤切换器。
 *
 * 三种形态：
 *   <ThemeSwitcher />                    紧凑型下拉（放博客导航等宽处）
 *   <ThemeSwitcher variant="panel" />    面板型三选一（放设置页）
 *   <ThemeSwitcher variant="menu" />     单行内联三选一（放进账号下拉菜单里，
 *                                        避免在菜单内再套一层弹层）
 *
 * 选择会即时生效并写入 localStorage（key: webbook:theme），
 * 也可由 index.html 的首屏同步脚本在 React 之前先应用，避免闪烁。
 */
export function ThemeSwitcher({ variant = 'compact' }: { variant?: 'compact' | 'panel' | 'menu' }) {
  const [skin, setSkin] = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 点击外部 / Escape 关闭
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

  const active = THEME_META.find((t) => t.skin === skin) ?? THEME_META[0]!;

  // 内联三选一：放在账号下拉菜单里，不引入嵌套弹层
  if (variant === 'menu') {
    return (
      <div className="theme-inline" role="radiogroup" aria-label="页面皮肤">
        {THEME_META.map((t) => {
          const on = t.skin === skin;
          return (
            <button
              key={t.skin}
              type="button"
              role="radio"
              aria-checked={on}
              className={`theme-inline-item ${on ? 'is-on' : ''}`}
              title={t.hint}
              onClick={() => setSkin(t.skin)}
            >
              <span className="theme-switch-dots" aria-hidden="true">
                {t.swatch.slice(0, 3).map((c, i) => (
                  <i key={i} style={{ background: c }} />
                ))}
              </span>
              {t.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === 'panel') {
    return (
      <div className="theme-panel" role="radiogroup" aria-label="页面皮肤">
        {THEME_META.map((t) => {
          const on = t.skin === skin;
          return (
            <button
              key={t.skin}
              type="button"
              role="radio"
              aria-checked={on}
              className={`theme-card ${on ? 'is-on' : ''}`}
              onClick={() => setSkin(t.skin)}
            >
              <span className="theme-card-swatch" aria-hidden="true">
                {t.swatch.map((c, i) => (
                  <i key={i} style={{ background: c }} />
                ))}
              </span>
              <span className="theme-card-body">
                <strong>{t.label}</strong>
                <span className="muted">{t.hint}</span>
              </span>
              {on ? <Icon name="check" size={14} /> : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="theme-switch" ref={rootRef}>
      <button
        type="button"
        className="btn btn-ghost theme-switch-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`页面皮肤：${active.label}`}
        title="切换页面皮肤"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="theme-switch-dots" aria-hidden="true">
          {active.swatch.slice(0, 3).map((c, i) => (
            <i key={i} style={{ background: c }} />
          ))}
        </span>
        <span className="theme-switch-label">{active.label}</span>
        <Icon name="chevron-down" size={12} />
      </button>
      {open && (
        <div className="theme-switch-menu" role="listbox" aria-label="页面皮肤">
          {THEME_META.map((t) => {
            const on = t.skin === skin;
            return (
              <button
                key={t.skin}
                type="button"
                role="option"
                aria-selected={on}
                className={`theme-switch-item ${on ? 'is-on' : ''}`}
                onClick={() => {
                  setSkin(t.skin);
                  setOpen(false);
                }}
              >
                <span className="theme-switch-dots" aria-hidden="true">
                  {t.swatch.slice(0, 3).map((c, i) => (
                    <i key={i} style={{ background: c }} />
                  ))}
                </span>
                <span className="theme-switch-item-body">
                  <strong>{t.label}</strong>
                  <span className="muted">{t.hint}</span>
                </span>
                {on ? <Icon name="check" size={12} /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
