export const COMMENT_SCHEMA_VERSION = 1;

export type CommentAuthorType = 'user' | 'guest';

export interface CommentAuthor {
  type: CommentAuthorType;
  displayName: string;
  userId?: string;
  guestId?: string;
  avatarHue?: number;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: CommentAuthor;
}

export interface NoteComments {
  schemaVersion: number;
  noteId: string;
  comments: Comment[];
}

export function createEmptyComments(noteId: string): NoteComments {
  return { schemaVersion: COMMENT_SCHEMA_VERSION, noteId, comments: [] };
}
