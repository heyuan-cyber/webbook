import { useEffect, useRef } from 'react';
import { useMotionSafe } from '@/lib/motion';

/**
 * 沉浸式首页：横跨多屏的 cinematic hero。
 * 参考 synth "Where code becomes sensation." —— overline pill + 两行衬线大标题(第二行斜体/渐变) + 副文案 + 鼠标可交互粒子星座。
 * 滚动使用原生 CSS scroll-snap（可上滑/下滑、平滑），滚到最后一屏后继续下滚自动切换到下一个 tab (advanceTab)。
 */
export function HomeTab({
  name,
  advanceTab,
}: {
  name: string;
  advanceTab: () => void;
}) {
  const reduced = useMotionSafe();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastSectionRef = useRef(false);

  // ── 鼠标可交互粒子星座（游戏感）─────────────────────────────
  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cnv: HTMLCanvasElement = canvas;
    const c2d: CanvasRenderingContext2D = ctx;

    let raf = 0;
    let w = 0;
    let h = 0;
    let mouse = { x: 0, y: 0 };
    const COUNT = 60;
    const dots = Array.from({ length: COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0012,
      vy: (Math.random() - 0.5) * 0.0012,
      r: 1 + Math.random() * 2,
      hue: Math.random() < 0.5 ? 48 : 174, // gold / teal
    }));

    function resize() {
      w = cnv.width = cnv.offsetWidth * (window.devicePixelRatio || 1);
      h = cnv.height = cnv.offsetHeight * (window.devicePixelRatio || 1);
    }
    function onMouse(e: MouseEvent) {
      const rect = cnv.getBoundingClientRect();
      mouse = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    }
    function step() {
      raf = requestAnimationFrame(step);
      c2d.clearRect(0, 0, w, h);
      for (const d of dots) {
        d.x += d.vx;
        d.y += d.vy;
        const dx = (mouse.x - d.x) * 0.0006;
        const dy = (mouse.y - d.y) * 0.0006;
        d.x += dx;
        d.y += dy;
        if (d.x < 0 || d.x > 1) d.vx *= -1;
        if (d.y < 0 || d.y > 1) d.vy *= -1;
        d.x = Math.min(1, Math.max(0, d.x));
        d.y = Math.min(1, Math.max(0, d.y));
        const glow = `hsla(${d.hue}, 85%, 68%, 0.85)`;
        c2d.beginPath();
        c2d.arc(d.x * w, d.y * h, d.r, 0, Math.PI * 2);
        c2d.fillStyle = glow;
        c2d.shadowBlur = 12;
        c2d.shadowColor = glow;
        c2d.fill();
        c2d.shadowBlur = 0;
      }
    }
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouse);
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouse);
    };
  }, [reduced]);

  // ── 滚动到最后 section 后继续下滚 → auto-advance ──────────
  useEffect(() => {
    if (reduced) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    const el: HTMLElement = scroller;

    function onScroll() {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      lastSectionRef.current = atBottom;
    }
    const onWheel = (e: WheelEvent) => {
      const el = scroller;
      if (!el || e.deltaY <= 0) return;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      if (atBottom) advanceTab();
    };
    const onTouchEnd = (e: TouchEvent) => {
      const el = scroller;
      if (!el || !lastSectionRef.current) return;
      const lastY = touchStartY.current;
      const y = e.changedTouches[0]?.clientY ?? lastY;
      const dir = lastY - y;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      if (dir > 0 && atBottom) advanceTab();
    };
    const touchStartY = { current: 0 };
    const onTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0]?.clientY ?? 0;
    };

    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [reduced, advanceTab]);

  return (
    <div className="io-home-scroller" ref={scrollRef}>
      <div className="io-home">
        <section className="io-home-slide io-home-hero on">
          <canvas ref={canvasRef} className="io-home-canvas" aria-hidden="true" />
          <span className="io-home-pill">GAME DEV · AVATAR {name.toUpperCase()} · AVAILABLE FOR 2026</span>
          <h1 className="io-home-title">
            <span className="io-home-line1">Where code</span>
            <span className="io-home-line2">becomes sensation.</span>
          </h1>
          <p className="io-home-sub">
            用代码造游戏，也把背后的思考写下来 —— 游戏开发 · 案例 · 系统 · 计算机基础 · 独立游戏设计。
          </p>
          <div className="io-home-actions">
            <button type="button" className="btn btn-primary btn-glow" onClick={() => advanceTab()}>
              进入作品集
            </button>
            <a className="btn btn-ghost" href="#site-blog">
              浏览博客
            </a>
          </div>
          <span className="io-home-scroll" aria-hidden="true">▾ Scroll to explore</span>
        </section>

        <section id="site-blog" className="io-home-slide io-home-intro">
          <div className="io-home-intro-card">
            <span className="io-home-intro-kicker">THIS SITE</span>
            <h2 className="io-home-intro-title">一个站点，两种读法。</h2>
            <p className="io-home-intro-body">
              用笔记记录我在游戏开发与计算机世界里的实践与思考：可玩的作品、可复用的系统、
              反复踩坑后的知识整理，还有对独立游戏设计与叙事的琢磨。
            </p>
            <div className="io-home-intro-chips">
              <span>游戏开发</span>
              <span>具体案例</span>
              <span>系统</span>
              <span>Demo</span>
              <span>计算机基础</span>
              <span>独立游戏设计</span>
            </div>
            <button type="button" className="btn btn-primary btn-glow" onClick={() => advanceTab()}>
              查看项目示例 →
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
