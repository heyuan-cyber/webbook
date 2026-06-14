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
