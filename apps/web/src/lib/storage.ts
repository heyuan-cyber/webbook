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

/** AI 助手对话：按笔记 id 存 IndexedDB（消息可能很长，不适合 localStorage） */
const AI_CHAT_PREFIX = 'webbook:ai-chat:';

export interface StoredChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const aiChatState = {
  async load(noteId: string): Promise<StoredChatMessage[]> {
    return (await get<StoredChatMessage[]>(AI_CHAT_PREFIX + noteId)) ?? [];
  },
  async save(noteId: string, messages: StoredChatMessage[]): Promise<void> {
    await set(AI_CHAT_PREFIX + noteId, messages);
  },
  async clear(noteId: string): Promise<void> {
    await del(AI_CHAT_PREFIX + noteId);
  },
};

/** AI 面板展开状态：跨笔记记住用户偏好 */
const AI_PANEL_OPEN_KEY = 'webbook:ai-panel-open';

export const aiPanelOpenState = {
  load(): boolean {
    try {
      return localStorage.getItem(AI_PANEL_OPEN_KEY) === '1';
    } catch {
      return false;
    }
  },
  save(open: boolean): void {
    try {
      localStorage.setItem(AI_PANEL_OPEN_KEY, open ? '1' : '0');
    } catch {
      /* 忽略隐私模式等写入失败 */
    }
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

/** 规划树折叠：按 scope key（节点 id / 'all'）存 localStorage */
const PLAN_FOLD_KEY = 'webbook:plan-fold';

export const planFoldState = {
  load(scopeKey: string): Record<string, boolean> {
    try {
      const all = JSON.parse(localStorage.getItem(PLAN_FOLD_KEY) ?? '{}') as Record<
        string,
        Record<string, boolean>
      >;
      return all[scopeKey] ?? {};
    } catch {
      return {};
    }
  },
  save(scopeKey: string, state: Record<string, boolean>): void {
    try {
      const raw = localStorage.getItem(PLAN_FOLD_KEY);
      const all = raw ? (JSON.parse(raw) as Record<string, Record<string, boolean>>) : {};
      all[scopeKey] = state;
      localStorage.setItem(PLAN_FOLD_KEY, JSON.stringify(all));
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

/** 布局沉浸偏好：侧栏 / 大纲面板是否收起 */
const LAYOUT_UI_KEY = 'webbook:layout-ui';export interface LayoutUiState {
  sidebarCollapsed: boolean;
  outlineCollapsed: boolean;
  /**
   * 侧栏宽度（px）。原先固定 300px，而目录最深有 6–7 级：
   * 缩进 + 行内工具按钮会把标题挤到只剩一个字。允许用户拖拽调整并记住。
   */
  sidebarWidth: number;
}

/** 侧栏宽度边界：低于 220 装不下工具按钮，高于 460 会喧宾夺主 */
export const SIDEBAR_MIN_W = 220;
export const SIDEBAR_MAX_W = 460;
export const SIDEBAR_DEFAULT_W = 280;

export function clampSidebarWidth(px: number): number {
  if (!Number.isFinite(px)) return SIDEBAR_DEFAULT_W;
  return Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, Math.round(px)));
}

export const layoutUiState = {
  load(): LayoutUiState {
    try {
      const raw = JSON.parse(localStorage.getItem(LAYOUT_UI_KEY) ?? '{}') as Partial<LayoutUiState>;
      return {
        sidebarCollapsed: Boolean(raw.sidebarCollapsed),
        outlineCollapsed: Boolean(raw.outlineCollapsed),
        sidebarWidth: clampSidebarWidth(raw.sidebarWidth ?? SIDEBAR_DEFAULT_W),
      };
    } catch {
      return {
        sidebarCollapsed: false,
        outlineCollapsed: false,
        sidebarWidth: SIDEBAR_DEFAULT_W,
      };
    }
  },
  save(patch: Partial<LayoutUiState>): void {
    try {
      const next = { ...layoutUiState.load(), ...patch };
      localStorage.setItem(LAYOUT_UI_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  },
};

/** 页面皮肤（主题色）：三套，纯本地偏好 */
const THEME_KEY = 'webbook:theme';

export const THEME_SKINS = ['gold', 'paper', 'blueprint'] as const;
export type ThemeSkin = (typeof THEME_SKINS)[number];

export const DEFAULT_THEME: ThemeSkin = 'gold';

export function isThemeSkin(value: unknown): value is ThemeSkin {
  return typeof value === 'string' && (THEME_SKINS as readonly string[]).includes(value);
}

export const themeState = {
  load(): ThemeSkin {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      return isThemeSkin(raw) ? raw : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  },
  save(skin: ThemeSkin): void {
    try {
      localStorage.setItem(THEME_KEY, skin);
    } catch {
      /* 忽略隐私模式等写入失败 */
    }
  },
};
