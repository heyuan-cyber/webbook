import type { Env } from './env';
import { getFile } from './github';
import type { NoteTree, PublicFeedItem, TreeNode, BloggerSummary } from '@webbook/shared';
import { LEGACY_TREE_PATH } from '@webbook/shared';
import { filterPublicTree } from './tree-filter';
import { getUserEmail, listKnownUserIds } from './usersRegistry';
import { loadUserNote, loadUserTree } from './userData';

function walkPublicNodes(
  nodes: TreeNode[],
  ownerId: string,
  ownerEmail: string,
  out: PublicFeedItem[],
) {
  for (const node of nodes) {
    if (node.kind === 'note' && node.visibility === 'public') {
      out.push({
        ownerId,
        ownerEmail,
        noteId: node.noteId ?? node.id,
        title: node.title,
      });
    }
    if (node.children?.length) walkPublicNodes(node.children, ownerId, ownerEmail, out);
  }
}

async function enrichFeedItem(env: Env, item: PublicFeedItem): Promise<PublicFeedItem> {
  const note = await loadUserNote(env, item.ownerId, item.noteId);
  if (!note || note.visibility !== 'public') return item;
  return { ...item, updatedAt: note.updatedAt, summary: note.summary };
}

function dedupeFeed(items: PublicFeedItem[]): PublicFeedItem[] {
  const seen = new Set<string>();
  const out: PublicFeedItem[] = [];
  for (const it of items) {
    const key = `${it.ownerId}:${it.noteId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/** 聚合所有用户的 public 笔记（全网 /blog） */
export async function buildGlobalPublicFeed(env: Env): Promise<PublicFeedItem[]> {
  const items: PublicFeedItem[] = [];
  const userIds = await listKnownUserIds(env);

  for (const ownerId of userIds) {
    const tree = await loadUserTree(env, ownerId);
    const email = await getUserEmail(env, ownerId);
    walkPublicNodes(filterPublicTree(tree).roots, ownerId, email, items);
  }

  const legacyRaw = await getFile(env, LEGACY_TREE_PATH);
  if (legacyRaw) {
    const tree = JSON.parse(legacyRaw) as NoteTree;
    walkPublicNodes(filterPublicTree(tree).roots, 'legacy', '站点作者', items);
  }

  const enriched = await Promise.all(dedupeFeed(items).map((it) => enrichFeedItem(env, it)));
  return enriched.sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  });
}

/** 圈子成员 public 子集（shareStatus=public_feed 的成员） */
export async function buildCircleFeed(
  env: Env,
  memberUserIds: string[],
  shareByUser: Map<string, boolean>,
): Promise<PublicFeedItem[]> {
  const items: PublicFeedItem[] = [];
  for (const ownerId of memberUserIds) {
    if (!shareByUser.get(ownerId)) continue;
    const tree = await loadUserTree(env, ownerId);
    const email = await getUserEmail(env, ownerId);
    walkPublicNodes(filterPublicTree(tree).roots, ownerId, email, items);
  }
  const enriched = await Promise.all(dedupeFeed(items).map((it) => enrichFeedItem(env, it)));
  return enriched.sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  });
}

/** 单个用户的 public 笔记（个人独立博客） */
export async function buildUserPublicFeed(env: Env, userId: string): Promise<PublicFeedItem[]> {
  const tree = await loadUserTree(env, userId);
  const email = await getUserEmail(env, userId);
  const items: PublicFeedItem[] = [];
  walkPublicNodes(filterPublicTree(tree).roots, userId, email, items);
  const enriched = await Promise.all(dedupeFeed(items).map((it) => enrichFeedItem(env, it)));
  return enriched.sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  });
}

/** 有公开笔记的博主目录（不含混排文章） */
export async function buildBloggersDirectory(env: Env): Promise<BloggerSummary[]> {
  const userIds = await listKnownUserIds(env);
  const out: BloggerSummary[] = [];

  for (const userId of userIds) {
    const feed = await buildUserPublicFeed(env, userId);
    if (feed.length === 0) continue;
    out.push({
      userId,
      email: await getUserEmail(env, userId),
      postCount: feed.length,
    });
  }

  const legacyRaw = await getFile(env, LEGACY_TREE_PATH);
  if (legacyRaw) {
    const tree = JSON.parse(legacyRaw) as NoteTree;
    const legacyItems: PublicFeedItem[] = [];
    walkPublicNodes(filterPublicTree(tree).roots, 'legacy', '站点作者', legacyItems);
    if (legacyItems.length > 0) {
      out.push({ userId: 'legacy', email: '站点作者', postCount: legacyItems.length });
    }
  }

  return out.sort((a, b) => b.postCount - a.postCount);
}
