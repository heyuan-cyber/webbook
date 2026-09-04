import { Link } from 'react-router-dom';
import type { PublicFeedItem } from '@webbook/shared';
import { assetUrl } from '@/lib/api';
import { blogPostPath, formatDate } from '@/lib/blog';

const UNC = '未分类';

/** 按给定的笔记 id 顺序，把 id 解析成 feed 中的文章；不存在的 id 忽略。 */
export function resolveIds(posts: PublicFeedItem[], ids?: string[]): PublicFeedItem[] {
  if (!ids || ids.length === 0) return [];
  const byId = new Map(posts.map((p) => [p.noteId, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is PublicFeedItem => Boolean(p));
}

export interface BlogGroup {
  category: string;
  posts: PublicFeedItem[];
}

/** 按笔记 category 分组；若提供 categoryOrder 则按其顺序排序分组，未列出的类别放最后。 */
export function groupByCategory(posts: PublicFeedItem[], order?: string[]): BlogGroup[] {
  const groups = new Map<string, PublicFeedItem[]>();
  for (const p of posts) {
    const cat = p.category?.trim() || UNC;
    const arr = groups.get(cat);
    if (arr) arr.push(p);
    else groups.set(cat, [p]);
  }
  const keys = [...groups.keys()];
  if (order && order.length) {
    const orderIdx = new Map(order.map((c, i) => [c, i]));
    keys.sort((a, b) => {
      const ia = orderIdx.get(a);
      const ib = orderIdx.get(b);
      if (ia !== undefined && ib !== undefined) return ia - ib;
      if (ia !== undefined) return -1;
      if (ib !== undefined) return 1;
      return a.localeCompare(b, 'zh-CN');
    });
  } else {
    keys.sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }
  return keys.map((k) => ({ category: k, posts: groups.get(k)! }));
}

export function NoteCard({ post, compact = false }: { post: PublicFeedItem; compact?: boolean }) {
  const cover = post.cover ? assetUrl(post.cover) : undefined;
  return (
    <Link to={blogPostPath(post)} className={`io-card ${compact ? 'io-card-compact' : ''}`}>
      {cover ? (
        <img className="io-card-cover" src={cover} alt={post.title} loading="lazy" />
      ) : (
        <div className="io-card-cover io-card-cover-empty" aria-hidden="true" />
      )}
      <span className="io-card-meta">
        {post.category ? <span className="blog-crumb muted">{post.category}</span> : null}
        <span className="io-card-date muted">{formatDate(post.updatedAt)}</span>
      </span>
      <span className="io-card-title">{post.title}</span>
      {post.summary ? <span className="io-card-summary muted">{post.summary}</span> : null}
      <span className="io-card-cta">查看</span>
    </Link>
  );
}
