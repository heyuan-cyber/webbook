import { create } from 'zustand';

/**
 * 笔记编辑器的"视图态"（非持久化数据）。
 *
 * 为什么单独开一个 store：方案 B 把元信息（保存态 / 可见性 / 预览 / 历史 / 导出）
 * 从笔记头搬进了顶栏，而顶栏（`ShellTopBar`）与正文（`NoteEditor`）是两棵子树。
 * `preview` 原本是 `NoteEditor` 的局部 state，搬上去后两边都要读写，
 * 所以提升到这里；`historyOpen` 同理（顶栏放按钮，面板留在编辑器内）。
 *
 * 只放"当前这篇笔记的界面开关"，不放笔记内容本身（那在 `useNotesStore`）。
 */
interface EditorUiState {
  /** 预览模式：正文用只读渲染替代舞台编辑器 */
  preview: boolean;
  setPreview: (next: boolean) => void;
  togglePreview: () => void;

  /** 版本历史面板是否展开（顶栏按钮控制，面板渲染在编辑器内） */
  historyOpen: boolean;
  setHistoryOpen: (next: boolean) => void;

  /** 顶栏「更多」菜单（历史 / 导出等低频动作）是否展开 */
  moreOpen: boolean;
  setMoreOpen: (next: boolean) => void;

  /** 切换笔记时把界面开关复位 */
  resetForNote: () => void;
}

export const useEditorUiStore = create<EditorUiState>((set) => ({
  preview: false,
  setPreview: (next) => set({ preview: next }),
  togglePreview: () => set((s) => ({ preview: !s.preview })),

  historyOpen: false,
  setHistoryOpen: (next) => set({ historyOpen: next }),

  moreOpen: false,
  setMoreOpen: (next) => set({ moreOpen: next }),

  resetForNote: () => set({ preview: false, historyOpen: false, moreOpen: false }),
}));
