import type { PublicFeedItem } from '@webbook/shared';
import { Reveal } from '@/components/Reveal';
import { EmptyState } from '@/components/EmptyState';
import { assetUrl } from '@/lib/api';
import { blogPostPath } from '@/lib/blog';
import { Link } from 'react-router-dom';

/**
 * 项目示例 —— Swiss 卡片网格：一个 section 内的 selected work 卡（封面/标题/分类/简介 + 查看）。
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
    <div className="swiss-work">
      <div className="swiss-section-head">
        <div>
          <span className="swiss-kicker">SELECTED WORK</span>
          <h2 className="swiss-h2">项目示例</h2>
        </div>
        <p className="swiss-lede">
          每一个项目都从笔记里长出来 —— 一个作品、一套系统、一次动手实践。
        </p>
      </div>
      <div className="swiss-work-grid">
        {posts.map((post, i) => {
          const cover = post.cover ? assetUrl(post.cover) : undefined;
          return (
            <Reveal key={post.noteId}>
              <Link to={blogPostPath(post)} className="swiss-work-card">
                {cover ? (
                  <img className="swiss-work-cover" src={cover} alt={post.title} loading="lazy" />
                ) : (
                  <div className="swiss-work-cover swiss-work-cover-empty" aria-hidden="true" />
                )}
                <span className="swiss-work-spine">
                  {post.category ? <span className="swiss-tag">{post.category}</span> : null}
                  <span className="swiss-tag">{String(i + 1).padStart(2, '0')}</span>
                </span>
                <span className="swiss-work-body">
                  <span className="swiss-work-name">{post.title}</span>
                  {post.summary ? (
                    <span className="swiss-work-summary">{post.summary}</span>
                  ) : null}
                  <span className="swiss-work-cta">View Project →</span>
                </span>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
