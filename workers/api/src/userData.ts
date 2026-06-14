import type { Env } from './env';
import { getFile, putFile, deleteFile, getFileAtRef, fileHistory } from './github';
import type { Note, NoteTree } from '@webbook/shared';
import { normalizeNote } from '@webbook/shared';
import {
  LEGACY_NOTE_PATH,
  LEGACY_TREE_PATH,
  USER_NOTE_PATH,
  USER_TREE_PATH,
} from '@webbook/shared';
import { registerUser } from './usersRegistry';
import { isTreeEmpty } from '@webbook/shared';

/** 旧版全局数据在 feed / 管理后台中的 ownerId */
export const LEGACY_OWNER_ID = 'legacy';

export function isLegacyOwner(ownerId: string): boolean {
  return ownerId === LEGACY_OWNER_ID;
}

export async function loadUserTree(env: Env, userId: string): Promise<NoteTree> {
  const path = USER_TREE_PATH(userId);
  let raw = await getFile(env, path);
  if (raw) {
    const tree = JSON.parse(raw) as NoteTree;
    if (!isTreeEmpty(tree)) return tree;
  }
  raw = await getFile(env, LEGACY_TREE_PATH);
  return raw
    ? (JSON.parse(raw) as NoteTree)
    : { schemaVersion: 1, roots: [] };
}

export async function saveUserTree(
  env: Env,
  userId: string,
  email: string,
  tree: NoteTree,
): Promise<void> {
  await registerUser(env, userId, email);
  await putFile(
    env,
    USER_TREE_PATH(userId),
    JSON.stringify(tree, null, 2),
    `user ${userId}: update tree`,
  );
}

export async function loadUserNote(
  env: Env,
  userId: string,
  noteId: string,
): Promise<Note | null> {
  const path = USER_NOTE_PATH(userId, noteId);
  let raw = await getFile(env, path);
  if (!raw) {
    raw = await getFile(env, LEGACY_NOTE_PATH(noteId));
  }
  if (!raw) return null;
  return normalizeNote(JSON.parse(raw) as Note);
}

export async function saveUserNote(
  env: Env,
  userId: string,
  email: string,
  note: Note,
): Promise<void> {
  await registerUser(env, userId, email);
  await putFile(
    env,
    USER_NOTE_PATH(userId, note.id),
    JSON.stringify(note, null, 2),
    `user ${userId}: update note ${note.id}`,
  );
}

export async function deleteUserNote(env: Env, userId: string, noteId: string): Promise<void> {
  if (isLegacyOwner(userId)) {
    await deleteLegacyNote(env, noteId);
    return;
  }
  await deleteFile(env, USER_NOTE_PATH(userId, noteId), `user ${userId}: delete note ${noteId}`);
}

export async function loadLegacyTree(env: Env): Promise<NoteTree> {
  const raw = await getFile(env, LEGACY_TREE_PATH);
  return raw ? (JSON.parse(raw) as NoteTree) : { schemaVersion: 1, roots: [] };
}

export async function saveLegacyTree(env: Env, tree: NoteTree): Promise<void> {
  await putFile(
    env,
    LEGACY_TREE_PATH,
    JSON.stringify(tree, null, 2),
    'legacy: update tree',
  );
}

export async function saveLegacyNote(env: Env, note: Note): Promise<void> {
  await putFile(
    env,
    LEGACY_NOTE_PATH(note.id),
    JSON.stringify(note, null, 2),
    `legacy: update note ${note.id}`,
  );
}

export async function deleteLegacyNote(env: Env, noteId: string): Promise<void> {
  await deleteFile(env, LEGACY_NOTE_PATH(noteId), `legacy: delete note ${noteId}`);
}

export async function loadUserNoteAtSha(
  env: Env,
  userId: string,
  noteId: string,
  sha: string,
): Promise<Note | null> {
  const raw = await getFileAtRef(env, USER_NOTE_PATH(userId, noteId), sha);
  if (!raw) {
    const legacy = await getFileAtRef(env, LEGACY_NOTE_PATH(noteId), sha);
    if (!legacy) return null;
    return normalizeNote(JSON.parse(legacy) as Note);
  }
  return normalizeNote(JSON.parse(raw) as Note);
}

export function userNoteFilePath(userId: string, noteId: string): string {
  return USER_NOTE_PATH(userId, noteId);
}

export async function userNoteHistory(env: Env, userId: string, noteId: string) {
  return fileHistory(env, USER_NOTE_PATH(userId, noteId));
}

/** 在所有用户（含 legacy）中定位笔记所有者 */
export async function findNoteOwner(
  env: Env,
  noteId: string,
  userIds: string[],
): Promise<string | null> {
  for (const uid of userIds) {
    const note = await loadUserNote(env, uid, noteId);
    if (note) return uid;
  }
  const legacy = await getFile(env, LEGACY_NOTE_PATH(noteId));
  if (legacy) return 'legacy';
  return null;
}
