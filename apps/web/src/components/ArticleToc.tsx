import { useEffect, useMemo, useState } from 'react';
import type { Block } from '@webbook/shared';
import { useMotionSafe } from '@/lib/motion';

interface TocItem {
  id: string;
  text: string;
  level: number; // 1|2|3
}

/** 从 heading block 提取目录。 */
export function buildToc(blocks: Block[]): TocItem[] {
  return blocks
    .filter((b): b is Extract<Block, { type: 'heading' }> => b.type === 'heading' && Boolean(b.text.trim()))
    .map((b) => ({ id: `block-${b.id}`, text: b.text.trim(), level: b.level }));
}

/**
 * 右侧目录：点击滚动定位，滚动时高亮当前节。
 * 移动端折叠为可展开的开关。
 */
export function ArticleToc({ blocks }: { blocks: Block[] }) {
  const items = useMemo(() => buildToc(blocks), [blocks]);
  const reduced = useMotionSafe();
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (items.length === 0) return;
        let current: string | null = items[0]!.id;
        for (const item of items) {
          const el = document.getElementById(item.id);
          if (!el) continue;
          if (el.getBoundingClientRect().top <= 120) current = item.id;
          else break;
        }
        setActive(current);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [items, reduced]);

  if (items.length === 0) return null;

  function go(item: TocItem) {
    setOpen(false);
    const el = document.getElementById(item.id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    setActive(item.id);
  }

  return (
    <aside className={`blog-toc ${open ? 'is-open' : ''}`} aria-label="文章目录">
      <button
        type="button"
        className="blog-toc-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        目录
      </button>
      <nav className="blog-toc-nav">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`blog-toc-link lvl-${item.level} ${active === item.id ? 'active' : ''}`}
            onClick={() => go(item)}
          >
            {item.text}
          </button>
        ))}
      </nav>
    </aside>
  );
}
