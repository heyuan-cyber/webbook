import type { PublicFeedItem } from '@webbook/shared';

export function blogPostPath(post: PublicFeedItem): string {
  return `/blog/${post.ownerId}/${post.noteId}`;
}

export function userBlogPath(userId: string): string {
  return `/blog/u/${userId}`;
}
