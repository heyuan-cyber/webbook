import type { Env } from './env';
import type { NoteVisibility, PublicFeedItem } from '@webbook/shared';
import { buildGlobalPublicFeed } from './publicFeed';
import {
  loadUserNote,
  saveUserNote,
  deleteUserNote,
  loadUserTree,
  saveUserTree,
  loadLegacyTree,
  saveLegacyTree,
  saveLegacyNote,
  isLegacyOwner,
  LEGACY_OWNER_ID,
} from './userData';
import { getUserEmail } from './usersRegistry';
import { removeNoteFromTree, syncNoteVisibility } from './tree-filter';

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
  const tree = await loadUserTree(env, ownerId);
  const synced = syncNoteVisibility(tree, noteId, visibility);
  await saveUserTree(env, ownerId, email, synced);
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
  const tree = await loadUserTree(env, ownerId);
  const trimmed = removeNoteFromTree(tree, noteId);
  await saveUserTree(env, ownerId, email, trimmed);
}
