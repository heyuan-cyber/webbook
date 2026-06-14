import type { Env } from './env';
import { getFile, putFile, deleteFile } from './github';
import type { Note, NoteTree } from '@webbook/shared';
import { normalizeNote } from '@webbook/shared';
import { CIRCLE_NOTE_PATH, CIRCLE_TREE_PATH } from '@webbook/shared';

export async function loadCircleTree(env: Env, circleId: string): Promise<NoteTree> {
  const raw = await getFile(env, CIRCLE_TREE_PATH(circleId));
  return raw ? (JSON.parse(raw) as NoteTree) : { schemaVersion: 1, roots: [] };
}

export async function saveCircleTree(
  env: Env,
  circleId: string,
  tree: NoteTree,
): Promise<void> {
  await putFile(
    env,
    CIRCLE_TREE_PATH(circleId),
    JSON.stringify(tree, null, 2),
    `circle ${circleId}: update tree`,
  );
}

export async function loadCircleNote(
  env: Env,
  circleId: string,
  noteId: string,
): Promise<Note | null> {
  const raw = await getFile(env, CIRCLE_NOTE_PATH(circleId, noteId));
  if (!raw) return null;
  return normalizeNote(JSON.parse(raw) as Note);
}

export async function saveCircleNote(
  env: Env,
  circleId: string,
  note: Note,
): Promise<void> {
  await putFile(
    env,
    CIRCLE_NOTE_PATH(circleId, note.id),
    JSON.stringify(note, null, 2),
    `circle ${circleId}: update note ${note.id}`,
  );
}

export async function deleteCircleNote(
  env: Env,
  circleId: string,
  noteId: string,
): Promise<void> {
  await deleteFile(
    env,
    CIRCLE_NOTE_PATH(circleId, noteId),
    `circle ${circleId}: delete note ${noteId}`,
  );
}
