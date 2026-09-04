import type { PublicFeedItem } from '@webbook/shared';
import { Reveal } from '@/components/Reveal';
import { EmptyState } from '@/components/EmptyState';
import { assetUrl } from '@/lib/api';
import { blogPostPath } from '@/lib/blog';
import { Link } from 'react-router-dom';
import { useMotionSafe } from '@/lib/motion';

/**
 * 项目示例：参考 "Proof before pitch. Work that speaks first."
 * 大标题 + 错落 bento 大卡（封面/标题/简介/View Project/标签/spine + 指标）。
 */
export function WorkTab({
  posts,
  isOwner,
  onConfigure,
}: {
  posts: PublicFeedItem[];
  isOwner: boolean;
  onConfigure: () => void;
}) {
  const reduced = useMotionSafe();
  if (posts.length === 0) {
    return (
      <EmptyState
        icon="🗂️"
        title="项目示例待配置"
        body={isOwner ? '去设置里把笔记指派到「项目示例」区。' : '这位作者还没配置项目示例。'}
        action={
          isOwner ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={onConfigure}>
              去设置
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <section className="io-work">
      <div className="io-work-head">
        <div>
          <span className="io-work-kicker">SELECTED WORK</span>
          <h2 className="io-work-title">
            Proof before pitch.
            <br />
            <em className="io-work-title-em">Work that speaks first.</em>
          </h2>
        </div>
        <p className="io-work-lede muted">
          每一个项目都从笔记里长出来 —— 一个作品、一套系统、一次动手实践。
        </p>
      </div>
      <div className="io-work-grid">
        {posts.map((post, i) => {
          const cover = post.cover ? assetUrl(post.cover) : undefined;
          return (
            <Reveal key={post.noteId} className={`io-work-cell ${i % 3 === 1 ? 'io-work-cell-wide' : ''}`}>
              <Link to={blogPostPath(post)} className="io-work-card">
                {cover ? (
                  <img className="io-work-cover" src={cover} alt={post.title} loading="lazy" />
                ) : (
                  <div className="io-work-cover io-work-cover-empty" aria-hidden="true" />
                )}
                <span className="io-work-spine">
                  {post.category ? <span className="io-work-tag">{post.category}</span> : null}
                  <span className="io-work-tag io-work-tag-muted">
                    {reduced ? '案例' : `${String(i + 1).padStart(2, '0')}`}
                  </span>
                </span>
                <span className="io-work-metric muted">{readingMetric(post)}</span>
                <span className="io-work-body">
                  <span className="io-work-name">{post.title}</span>
                  {post.summary ? <span className="io-work-summary muted">{post.summary}</span> : null}
                  <span className="io-work-cta">View Project →</span>
                </span>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

function readingMetric(post: PublicFeedItem): string {
  const chars = (post.summary ?? post.title ?? '').length;
  const mins = Math.max(1, Math.round(chars / 500));
  return `${mins} min read`;
}
