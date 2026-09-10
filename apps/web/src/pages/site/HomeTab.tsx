import { Fragment } from 'react';

/**
 * Swiss hero —— 参考 Pitch Black Swiss：纯黑 + 巨型衬线词标 + overline + 副行 + marquee。
 * 这是一整页单页滚动的第一个 section（不再自带 scroll-snap 容器）。
 */
export function HomeTab({
  name,
  onExplore,
}: {
  name: string;
  scrolled?: boolean;
  onExplore?: () => void;
}) {
  const nameLabel = name?.trim() || '无名';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void onExplore;
  const marqueeItems = [
    'CREATIVE DEVELOPER',
    'BASED ONLINE',
    'DESIGN',
    'CODE',
    'BUILD',
    'SHIP',
  ];

  return (
    <div className="swiss-hero">
      <div className="swiss-hero-grid" aria-hidden="true" />
      <div className="swiss-hero-inner">
        <span className="swiss-hero-overline">个人主页 · {nameLabel.toUpperCase()}</span>
        <h1 className="swiss-hero-wordmark">{nameLabel}</h1>
        <p className="swiss-hero-sub">
          用代码造作品，也把背后的思考写下来 —— 游戏开发 · 案例 · 系统 · 计算机基础 · 独立游戏设计。
        </p>
        <div className="swiss-hero-actions">
          <button type="button" className="swiss-btn-primary" onClick={onExplore}>
            查看项目示例
          </button>
          <a className="swiss-btn-ghost" href="#swiss-blog">
            浏览博客
          </a>
        </div>
      </div>
      <span className="swiss-hero-scroll" aria-hidden="true">
        ▾ Scroll
      </span>
      <div className="swiss-marquee" aria-hidden="true">
        <div className="swiss-marquee-track">
          {[0, 1].map((dup) => (
            <Fragment key={dup}>
              {marqueeItems.map((it, i) => (
                <span className="swiss-marquee-item" key={`${dup}-${i}`}>
                  {it}
                </span>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
