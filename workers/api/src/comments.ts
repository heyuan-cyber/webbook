import type { Env } from './env';
import { getFile, putFile } from './github';
import type { Comment, CommentAuthor, Note, NoteComments } from '@webbook/shared';
import {
  createEmptyComments,
  COMMENT_SCHEMA_VERSION,
  COMMENT_PATH,
  LEGACY_NOTE_PATH,
} from '@webbook/shared';
import { normalizeNote } from '@webbook/shared';
import { loadUserNote } from './userData';

const MAX_BODY = 2000;
const MAX_NAME = 32;

export async function loadComments(
  env: Env,
  ownerId: string,
  noteId: string,
): Promise<NoteComments> {
  const path = COMMENT_PATH(ownerId, noteId);
  let raw = await getFile(env, path);
  if (!raw && ownerId !== 'legacy') {
    raw = await getFile(env, `data/comments/${noteId}.json`);
  }
  if (!raw) return createEmptyComments(noteId);
  const data = JSON.parse(raw) as NoteComments;
  return {
    schemaVersion: data.schemaVersion ?? COMMENT_SCHEMA_VERSION,
    noteId: data.noteId ?? noteId,
    comments: Array.isArray(data.comments) ? data.comments : [],
  };
}

export async function saveComments(env: Env, ownerId: string, data: NoteComments): Promise<void> {
  await putFile(
    env,
    COMMENT_PATH(ownerId, data.noteId),
    JSON.stringify(data, null, 2),
    `comment: ${ownerId}/${data.noteId}`,
  );
}

function sanitizeBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > MAX_BODY) return null;
  return trimmed;
}

function sanitizeName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed || trimmed.length > MAX_NAME) return null;
  return trimmed;
}

function guestIdValid(id: string): boolean {
  return /^guest_[\w-]{8,64}$/.test(id);
}

export function buildUserAuthor(userId: string, email: string): CommentAuthor {
  const displayName = email.includes('@') ? email.split('@')[0]! : email;
  return { type: 'user', userId, displayName: displayName || email };
}

export function buildGuestAuthor(input: {
  guestId: string;
  displayName: string;
  avatarHue?: number;
}): CommentAuthor | null {
  if (!guestIdValid(input.guestId)) return null;
  const displayName = sanitizeName(input.displayName);
  if (!displayName) return null;
  const hue =
    typeof input.avatarHue === 'number' && Number.isFinite(input.avatarHue)
      ? Math.floor(input.avatarHue) % 360
      : 200;
  return { type: 'guest', guestId: input.guestId, displayName, avatarHue: hue };
}

export async function assertPublicNote(
  env: Env,
  ownerId: string,
  noteId: string,
): Promise<Note | null> {
  let note = await loadUserNote(env, ownerId, noteId);
  if (!note && ownerId === 'legacy') {
    const raw = await getFile(env, LEGACY_NOTE_PATH(noteId));
    if (raw) note = normalizeNote(JSON.parse(raw) as Note);
  }
  if (!note || note.visibility !== 'public') return null;
  return note;
}

export async function addComment(
  env: Env,
  ownerId: string,
  noteId: string,
  body: string,
  author: CommentAuthor,
): Promise<Comment | null> {
  const text = sanitizeBody(body);
  if (!text) return null;

  const note = await assertPublicNote(env, ownerId, noteId);
  if (!note) return null;

  const file = await loadComments(env, ownerId, noteId);
  const comment: Comment = {
    id: `cmt_${crypto.randomUUID()}`,
    body: text,
    createdAt: new Date().toISOString(),
    author,
  };
  file.comments.push(comment);
  await saveComments(env, ownerId, file);
  return comment;
}
