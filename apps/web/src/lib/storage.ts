import { get, set, del, keys } from 'idb-keyval';
import type { Note, NoteTree } from '@webbook/shared';
import { createEmptyTree } from '@webbook/shared';

const TREE_KEY = 'webbook:tree';
const NOTE_PREFIX = 'webbook:note:';
const FOLD_KEY = 'webbook:foldstate';

/** 本地（游客 / 离线）存储：IndexedDB */
export const localStore = {
  async loadTree(): Promise<NoteTree> {
    return (await get<NoteTree>(TREE_KEY)) ?? createEmptyTree();
  },
  async saveTree(tree: NoteTree): Promise<void> {
    await set(TREE_KEY, tree);
  },
  async loadNote(id: string): Promise<Note | undefined> {
    return get<Note>(NOTE_PREFIX + id);
  },
  async saveNote(note: Note): Promise<void> {
    await set(NOTE_PREFIX + note.id, note);
  },
  async deleteNote(id: string): Promise<void> {
    await del(NOTE_PREFIX + id);
  },
  async allNoteIds(): Promise<string[]> {
    const all = await keys();
    return all
      .filter((k): k is string => typeof k === 'string' && k.startsWith(NOTE_PREFIX))
      .map((k) => k.slice(NOTE_PREFIX.length));
  },
};

/** 折叠状态：纯本地偏好，localStorage 足够 */
export const foldState = {
  load(): Record<string, boolean> {
    try {
      return JSON.parse(localStorage.getItem(FOLD_KEY) ?? '{}');
    } catch {
      return {};
    }
  },
  save(state: Record<string, boolean>): void {
    localStorage.setItem(FOLD_KEY, JSON.stringify(state));
  },
};
