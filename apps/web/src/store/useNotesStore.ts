import { create } from 'zustand';
import type { Block, Note, NoteTree, TreeNode, NoteVisibility } from '@webbook/shared';
import { createEmptyNote, createEmptyTree, findNode, normalizeNote } from '@webbook/shared';
import { uid } from '@/lib/id';
import { foldState } from '@/lib/storage';
import { makeRepository, type Repository } from './repository';
import type { Session } from '@/auth/types';
import { localStore } from '@/lib/storage';
import { toast } from '@/store/useToastStore';

interface NotesState {
  repo: Repository;
  tree: NoteTree;
  activeNoteId: string | null;
  activeNote: Note | null;
  folds: Record<string, boolean>;
  treeReady: boolean;
  treeLoading: boolean;
  noteLoading: boolean;
  saving: boolean;
  saveError: boolean;

  init: (session: Session | null) => Promise<void>;
  selectNote: (id: string) => Promise<void>;
  toggleFold: (nodeId: string) => void;
  searchNotes: (query: string) => Promise<SearchHit[]>;

  addFolder: (parentId: string | null, title: string) => Promise<void>;
  addNote: (parentId: string | null, title: string) => Promise<string>;
  renameNode: (id: string, title: string) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  moveNode: (id: string, newParentId: string | null, index: number) => Promise<void>;

  updateActiveBlocks: (blocks: Block[]) => void;
  setActiveTitle: (title: string) => void;
  setActiveVisibility: (visibility: NoteVisibility) => void;
}

export interface SearchHit {
  id: string;
  title: string;
  snippet: string;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function insertChild(
  nodes: TreeNode[],
  parentId: string | null,
  node: TreeNode,
): TreeNode[] {
  if (parentId === null) return [...nodes, node];
  return nodes.map((n) => {
    if (n.id === parentId) {
      return { ...n, children: [...(n.children ?? []), node] };
    }
    if (n.children) return { ...n, children: insertChild(n.children, parentId, node) };
    return n;
  });
}

function removeNode(nodes: TreeNode[], id: string): [TreeNode[], TreeNode | null] {
  let removed: TreeNode | null = null;
  const next: TreeNode[] = [];
  for (const n of nodes) {
    if (n.id === id) {
      removed = n;
      continue;
    }
    if (n.children) {
      const [childNodes, childRemoved] = removeNode(n.children, id);
      if (childRemoved) removed = childRemoved;
      next.push({ ...n, children: childNodes });
    } else {
      next.push(n);
    }
  }
  return [next, removed];
}

function patchNode(nodes: TreeNode[], id: string, patch: Partial<TreeNode>): TreeNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, ...patch };
    if (n.children) return { ...n, children: patchNode(n.children, id, patch) };
    return n;
  });
}

export const useNotesStore = create<NotesState>((setState, getState) => ({
  repo: makeRepository(null),
  tree: createEmptyTree(),
  activeNoteId: null,
  activeNote: null,
  folds: foldState.load(),
  treeReady: false,
  treeLoading: false,
  noteLoading: false,
  saving: false,
  saveError: false,

  async init(session) {
    const repo = makeRepository(session);
    setState({ repo, treeReady: false, treeLoading: true, saveError: false });
    try {
      const tree = await repo.loadTree();
      setState({ tree, treeReady: true, treeLoading: false });
    } catch {
      setState({ treeReady: true, treeLoading: false });
      toast('error', '加载目录失败，使用本地数据');
    }
  },

  async selectNote(id) {
    const { repo, tree, treeReady, activeNoteId } = getState();
    if (!treeReady) return;
    const node = findNode(tree.roots, id);
    if (!node || node.kind !== 'note') {
      setState({ activeNoteId: null, activeNote: null, noteLoading: false });
      return;
    }
    if (activeNoteId === id && getState().activeNote) return;
    setState({
      activeNoteId: id,
      activeNote: activeNoteId === id ? getState().activeNote : null,
      noteLoading: true,
    });
    try {
      let note = await repo.loadNote(node.noteId ?? id);
      if (!note) {
        note = createEmptyNote(id, node.title);
        void repo.saveNote(note);
      } else {
        note = normalizeNote(note);
      }
      setState({ activeNoteId: id, activeNote: note, noteLoading: false });
    } catch {
      setState({ noteLoading: false });
      toast('error', '加载笔记失败');
    }
  },

  toggleFold(nodeId) {
    const folds = { ...getState().folds, [nodeId]: !getState().folds[nodeId] };
    foldState.save(folds);
    setState({ folds });
  },

  async searchNotes(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const { tree } = getState();
    const hits: SearchHit[] = [];
    const seen = new Set<string>();

    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (n.kind === 'note') {
          if (n.title.toLowerCase().includes(q)) {
            hits.push({ id: n.id, title: n.title, snippet: '标题匹配' });
            seen.add(n.id);
          }
        }
        if (n.children) walk(n.children);
      }
    }
    walk(tree.roots);

    const ids = await localStore.allNoteIds();
    for (const id of ids) {
      if (seen.has(id)) continue;
      const note = await localStore.loadNote(id);
      if (!note) continue;
      const body = blocksToText(note.blocks).toLowerCase();
      if (note.title.toLowerCase().includes(q) || body.includes(q)) {
        const idx = body.indexOf(q);
        const snippet =
          idx >= 0
            ? note.blocks
                .map((b) => ('text' in b ? b.text : ''))
                .join(' ')
                .slice(Math.max(0, idx - 20), idx + 40)
            : note.title;
        hits.push({ id: note.id, title: note.title, snippet });
      }
    }
    return hits.slice(0, 20);
  },

  async addFolder(parentId, title) {
    const { tree, repo } = getState();
    const node: TreeNode = { id: uid('fld'), kind: 'folder', title, children: [] };
    const next = { ...tree, roots: insertChild(tree.roots, parentId, node) };
    setState({ tree: next });
    await repo.saveTree(next);
  },

  async addNote(parentId, title) {
    const { tree, repo } = getState();
    const id = uid('note');
    const node: TreeNode = { id, kind: 'note', title, noteId: id, visibility: 'private' };
    const next = { ...tree, roots: insertChild(tree.roots, parentId, node) };
    const note = createEmptyNote(id, title);
    setState({ tree: next, activeNoteId: id, activeNote: note, noteLoading: false });
    void repo.saveTree(next);
    void repo.saveNote(note);
    return id;
  },

  async renameNode(id, title) {
    const { tree, repo } = getState();
    const next = { ...tree, roots: patchNode(tree.roots, id, { title }) };
    setState({ tree: next });
    await repo.saveTree(next);
  },

  async deleteNode(id) {
    const { tree, repo, activeNoteId } = getState();
    const [roots] = removeNode(tree.roots, id);
    const next = { ...tree, roots };
    setState({ tree: next, ...(activeNoteId === id ? { activeNoteId: null, activeNote: null } : {}) });
    await repo.saveTree(next);
    await repo.deleteNote(id);
  },

  async moveNode(id, newParentId, index) {
    const { tree, repo } = getState();
    const [without, moved] = removeNode(tree.roots, id);
    if (!moved) return;
    let roots: TreeNode[];
    if (newParentId === null) {
      roots = [...without];
      roots.splice(index, 0, moved);
    } else {
      roots = without.map(function place(n): TreeNode {
        if (n.id === newParentId) {
          const children = [...(n.children ?? [])];
          children.splice(index, 0, moved);
          return { ...n, children };
        }
        if (n.children) return { ...n, children: n.children.map(place) };
        return n;
      });
    }
    const next = { ...tree, roots };
    setState({ tree: next });
    await repo.saveTree(next);
  },

  updateActiveBlocks(blocks) {
    const { activeNote } = getState();
    if (!activeNote) return;
    const updated: Note = { ...activeNote, blocks, updatedAt: new Date().toISOString() };
    setState({ activeNote: updated });
    scheduleSave(getState);
  },

  setActiveTitle(title) {
    const { activeNote, tree } = getState();
    if (!activeNote) return;
    const updated: Note = { ...activeNote, title, updatedAt: new Date().toISOString() };
    const next = { ...tree, roots: patchNode(tree.roots, activeNote.id, { title }) };
    setState({ activeNote: updated, tree: next });
    scheduleSave(getState);
  },

  setActiveVisibility(visibility) {
    const { activeNote, tree } = getState();
    if (!activeNote) return;
    const updated: Note = {
      ...activeNote,
      visibility,
      updatedAt: new Date().toISOString(),
    };
    const next = {
      ...tree,
      roots: patchNode(tree.roots, activeNote.id, { visibility }),
    };
    setState({ activeNote: updated, tree: next });
    scheduleSave(getState);
  },
}));

/** 防抖保存：编辑停止 800ms 后落盘（本地 + 远端） */
function scheduleSave(getState: () => NotesState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const { repo, activeNote, tree } = getState();
    if (!activeNote) return;
    useNotesStore.setState({ saving: true, saveError: false });
    const result = await repo.saveNote(activeNote);
    await repo.saveTree(tree);
    useNotesStore.setState({ saving: false, saveError: !result.noteOk });
    if (!result.noteOk && repo.authed) {
      toast('error', '云端保存失败，内容已存本地');
    }
  }, 800);
}

function blocksToText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      if ('text' in b && typeof b.text === 'string') return b.text;
      if (b.type === 'list') return b.items.join(' ');
      return '';
    })
    .join('\n');
}
