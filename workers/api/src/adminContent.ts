import type { Env } from './env';
import type { NoteTree, NoteVisibility, PublicFeedItem } from '@webbook/shared';
import { buildGlobalPublicFeed } from './publicFeed';
import {
  loadUserNote,
  saveUserNote,
  deleteUserNote,
  loadUserTreeWithRev,
  saveUserTreeConditional,
  loadLegacyTree,
  saveLegacyTree,
  saveLegacyNote,
  isLegacyOwner,
  LEGACY_OWNER_ID,
} from './userData';
import { FileConflictError } from './github';
import { getUserEmail } from './usersRegistry';
import { removeNoteFromTree, syncNoteVisibility } from './tree-filter';

/**
 * 管理后台对用户目录树的改动。
 *
 * 与客户端共用同一条条件写路径：先读 revision，再 compare-and-swap；冲突时重读重做一次。
 * 以前这里走的是**无条件** `saveUserTree`——管理员在后台点一下可见性，就会在用户开着的
 * 客户端背后推进 revision，让用户下一次改目录时收到"云端目录已被其他设备修改"。
 * 内容没有变化时不写：任何一次写都会让所有打开着的客户端变成"过期"。
 */
async function mutateUserTree(
  env: Env,
  ownerId: string,
  email: string,
  mutate: (tree: NoteTree) => NoteTree,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { tree, rev } = await loadUserTreeWithRev(env, ownerId);
    const next = mutate(tree);
    if (JSON.stringify(next.roots) === JSON.stringify(tree.roots)) return;
    try {
      await saveUserTreeConditional(env, ownerId, email, next, rev);
      return;
    } catch (e) {
      // 冲突：重读最新树后重做；其它错误直接上报（写失败不该被当成成功）
      if (!(e instanceof FileConflictError)) throw e;
    }
  }
  throw new Error('tree conflict');
}

/** 全站公开博客列表（供管理员审核） */
export async function adminListPublicNotes(env: Env): Promise<PublicFeedItem[]> {
  const posts = await buildGlobalPublicFeed(env);
  return posts.filter((p) => p.visibility === 'public' || !p.visibility);
}

export async function adminSetNoteVisibility(
  env: Env,
  ownerId: string,
  noteId: string,
  visibility: NoteVisibility,
): Promise<void> {
  const note = await loadUserNote(env, ownerId, noteId);
  if (!note) throw new Error('not found');
  note.visibility = visibility;
  note.updatedAt = new Date().toISOString();

  if (isLegacyOwner(ownerId)) {
    await saveLegacyNote(env, note);
    const tree = await loadLegacyTree(env);
    const synced = syncNoteVisibility(tree, noteId, visibility);
    await saveLegacyTree(env, synced);
    return;
  }

  const email = await getUserEmail(env, ownerId);
  await saveUserNote(env, ownerId, email, note);
  await mutateUserTree(env, ownerId, email, (tree) =>
    syncNoteVisibility(tree, noteId, visibility),
  );
}

export async function adminDeleteNote(
  env: Env,
  ownerId: string,
  noteId: string,
): Promise<void> {
  const note = await loadUserNote(env, ownerId, noteId);
  if (!note) throw new Error('not found');

  if (isLegacyOwner(ownerId)) {
    await deleteUserNote(env, LEGACY_OWNER_ID, noteId);
    const tree = await loadLegacyTree(env);
    const trimmed = removeNoteFromTree(tree, noteId);
    await saveLegacyTree(env, trimmed);
    return;
  }

  const email = await getUserEmail(env, ownerId);
  await deleteUserNote(env, ownerId, noteId);
  await mutateUserTree(env, ownerId, email, (tree) => removeNoteFromTree(tree, noteId));
}
