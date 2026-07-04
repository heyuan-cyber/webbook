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

/** 大纲折叠：按笔记 id 存 localStorage */
const OUTLINE_COLLAPSE_KEY = 'webbook:outline-collapse';

export const outlineCollapseState = {
  load(noteId: string): Record<string, boolean> {
    try {
      const all = JSON.parse(localStorage.getItem(OUTLINE_COLLAPSE_KEY) ?? '{}') as Record<
        string,
        Record<string, boolean>
      >;
      return all[noteId] ?? {};
    } catch {
      return {};
    }
  },
  save(noteId: string, state: Record<string, boolean>): void {
    try {
      const raw = localStorage.getItem(OUTLINE_COLLAPSE_KEY);
      const all = raw ? (JSON.parse(raw) as Record<string, Record<string, boolean>>) : {};
      all[noteId] = state;
      localStorage.setItem(OUTLINE_COLLAPSE_KEY, JSON.stringify(all));
    } catch {
      /* ignore */
    }
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
