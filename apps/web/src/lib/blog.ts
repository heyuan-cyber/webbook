import type { PublicFeedItem } from '@webbook/shared';

export type BlogTab = 'mine' | 'square' | 'circles';

export function blogPostPath(post: PublicFeedItem, circleId?: string): string {
  if (post.visibility === 'circle' && circleId) {
    return `/blog/circle/${circleId}/${post.ownerId}/${post.noteId}`;
  }
  return `/blog/${post.ownerId}/${post.noteId}`;
}

export function userBlogPath(userId: string): string {
  return `/blog/u/${userId}`;
}

export function blogHubPath(tab: BlogTab = 'mine'): string {
  return tab === 'mine' ? '/blog' : `/blog?tab=${tab}`;
}

/** Estimated reading time from text length (~500 chars/min). */
export function readingTime(text?: string): string {
  const chars = text?.trim().length ?? 0;
  const minutes = Math.max(1, Math.round(chars / 500));
  return `约 ${minutes} 分钟`;
}

/** Format an ISO date for blog meta. */
export function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Derive a display name from an email. */
export function nameFromEmail(email?: string): string {
  if (!email) return '匿名';
  return email.split('@')[0] || email;
}

/** One-letter avatar initial from an email-derived name. */
export function avatarInitial(email?: string): string {
  const n = nameFromEmail(email).trim();
  return (n[0] ?? '?').toUpperCase();
}
