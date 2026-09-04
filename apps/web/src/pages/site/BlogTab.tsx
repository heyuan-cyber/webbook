import { Reveal } from '@/components/Reveal';
import { EmptyState } from '@/components/EmptyState';
import { NoteCard, type BlogGroup } from './shared';

/**
 * 博客页：按类别分组的文章卡片（封面/标题/简介/时间）。
 * 分组默认按笔记 category，设置里可调整类别顺序。
 */
export function BlogTab({
  groups,
  isOwner,
  onConfigure,
}: {
  groups: BlogGroup[];
  isOwner: boolean;
  onConfigure: () => void;
}) {
  if (groups.length === 0) {
    return (
      <EmptyState
        icon="📄"
        title="博客待配置"
        body={isOwner ? '去设置里把笔记指派到「博客」区。' : '这位作者还没配置博客内容。'}
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
    <div className="io-blog">
      {groups.map((g) => (
        <section key={g.category} className="io-blog-cat">
          <header className="io-blog-cat-head">
            <span className="io-blog-cat-dot" aria-hidden="true" />
            <h2 className="io-blog-cat-title">{g.category}</h2>
            <span className="io-blog-cat-count muted">{g.posts.length} 篇</span>
          </header>
          <div className="io-blog-grid">
            {g.posts.map((post) => (
              <Reveal key={post.noteId}>
                <NoteCard post={post} />
              </Reveal>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
