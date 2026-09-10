import { Reveal } from '@/components/Reveal';
import { EmptyState } from '@/components/EmptyState';
import { NoteCard, type BlogGroup } from './shared';

/**
 * 博客页 —— Swiss 分类卡片分区：按笔记 category 分组，每类一段标题 + 卡片网格。
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
    <div className="swiss-blog">
      <div className="swiss-section-head">
        <div>
          <span className="swiss-kicker">WRITING</span>
          <h2 className="swiss-h2">博客</h2>
        </div>
        <p className="swiss-lede">按类别整理的笔记，随手写下的实践与思考。</p>
      </div>
      {groups.map((g) => (
        <section key={g.category} className="swiss-blog-cat">
          <header className="swiss-blog-cat-head">
            <h3 className="swiss-blog-cat-title">{g.category}</h3>
            <span className="swiss-blog-cat-count">{g.posts.length} 篇</span>
          </header>
          <div className="swiss-blog-grid">
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
