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
        visibility: 'public',
      });
    }
    if (node.children?.length) walkPublicNodes(node.children, ownerId, ownerEmail, out);
  }
}

function walkCircleBlogNodes(
  nodes: TreeNode[],
  ownerId: string,
  ownerEmail: string,
  out: PublicFeedItem[],
) {
  for (const node of nodes) {
    if (
      node.kind === 'note' &&
      (node.visibility === 'public' || node.visibility === 'circle')
    ) {
      out.push({
        ownerId,
        ownerEmail,
        noteId: node.noteId ?? node.id,
        title: node.title,
        visibility: node.visibility === 'circle' ? 'circle' : 'public',
      });
    }
    if (node.children?.length) walkCircleBlogNodes(node.children, ownerId, ownerEmail, out);
  }
}

async function enrichFeedItem(env: Env, item: PublicFeedItem): Promise<PublicFeedItem> {
  const note = await loadUserNote(env, item.ownerId, item.noteId);
  if (!note) return item;
  if (item.visibility === 'circle' && note.visibility !== 'circle') return item;
  if (item.visibility !== 'circle' && note.visibility !== 'public') return item;
  return { ...item, updatedAt: note.updatedAt, summary: note.summary };
}

function dedupeFeed(items: PublicFeedItem[]): PublicFeedItem[] {
  const byNote = new Map<string, PublicFeedItem>();
  for (const it of items) {
    const prev = byNote.get(it.noteId);
    if (!prev) {
      byNote.set(it.noteId, it);
      continue;
    }
    if (prev.ownerId === 'legacy' && it.ownerId !== 'legacy') {
      byNote.set(it.noteId, it);
    }
  }
  return [...byNote.values()];
}

function shuffleFeed(items: PublicFeedItem[]): PublicFeedItem[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** 聚合所有用户的 public 笔记（全网 /blog） */
export async function buildGlobalPublicFeed(env: Env): Promise<PublicFeedItem[]> {
  const items: PublicFeedItem[] = [];
  const userIds = await listKnownUserIds(env);
  const userNoteIds = new Set<string>();

  for (const ownerId of userIds) {
    const tree = await loadUserTree(env, ownerId);
    const email = await getUserEmail(env, ownerId);
    const before = items.length;
    walkPublicNodes(filterPublicTree(tree).roots, ownerId, email, items);
    for (let i = before; i < items.length; i++) {
      userNoteIds.add(items[i]!.noteId);
    }
  }

  const legacyRaw = await getFile(env, LEGACY_TREE_PATH);
  if (legacyRaw) {
    const tree = JSON.parse(legacyRaw) as NoteTree;
    const legacyItems: PublicFeedItem[] = [];
    walkPublicNodes(filterPublicTree(tree).roots, 'legacy', '站点作者', legacyItems);
    for (const item of legacyItems) {
      if (!userNoteIds.has(item.noteId)) items.push(item);
    }
  }

  const enriched = await Promise.all(dedupeFeed(items).map((it) => enrichFeedItem(env, it)));
  return enriched.sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  });
}

/** 博客广场：全网 public + 随机推荐 */
export async function buildSquareFeed(env: Env): Promise<PublicFeedItem[]> {
  const posts = await buildGlobalPublicFeed(env);
  return shuffleFeed(posts);
}

/** 圈子博客：成员 personal 笔记中 public + circle */
export async function buildCircleFeed(
  env: Env,
  memberUserIds: string[],
): Promise<PublicFeedItem[]> {
  const items: PublicFeedItem[] = [];
  for (const ownerId of memberUserIds) {
    const tree = await loadUserTree(env, ownerId);
    const email = await getUserEmail(env, ownerId);
    walkCircleBlogNodes(tree.roots, ownerId, email, items);
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
  const userNoteIds = new Set<string>();

  for (const userId of userIds) {
    const feed = await buildUserPublicFeed(env, userId);
    if (feed.length === 0) continue;
    for (const item of feed) userNoteIds.add(item.noteId);
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
    const orphanLegacy = legacyItems.filter((item) => !userNoteIds.has(item.noteId));
    if (orphanLegacy.length > 0) {
      out.push({ userId: 'legacy', email: '站点作者', postCount: orphanLegacy.length });
    }
  }

  return out.sort((a, b) => b.postCount - a.postCount);
}
