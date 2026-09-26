import { create } from 'zustand';
import type {
  Block,
  BlockEdge,
  Note,
  NoteStage,
  NoteTree,
  TreeNode,
  NoteVisibility,
} from '@webbook/shared';
import { createEmptyNote, createEmptyTree, findNode, normalizeNote } from '@webbook/shared';
import { collectSubtreeNodeIds } from '@webbook/shared';
import { uid } from '@/lib/id';
import { foldState } from '@/lib/storage';
import { makeRepository, type Repository } from './repository';
import { usePlanStore } from './usePlanStore';
import type { Session } from '@/auth/types';
import { localStore } from '@/lib/storage';
import { TreeConflictError } from '@/lib/api';
import { toast } from '@/store/useToastStore';

/** 乐观插图的本地预览，不可写入本地/远端笔记 */
function noteHasTransientImageSrc(note: Note): boolean {
  return note.blocks.some(
    (b) => b.type === 'image' && typeof b.src === 'string' && b.src.startsWith('blob:'),
  );
}

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
  /** 云端目录的 revision；写入时作为 baseRev 提交 */
  treeRev: string | null;
  /** 云端目录不可安全写入（只读本地模式） */
  treeLocalOnly: boolean;
  /** 未决的目录树冲突；本地树原样保留，等用户决定保留哪一份 */
  treeConflict: { localTree: NoteTree; serverRev: string | null } | null;

  init: (session: Session | null) => Promise<void>;
  selectNote: (id: string) => Promise<void>;
  toggleFold: (nodeId: string) => void;
  searchNotes: (query: string) => Promise<SearchHit[]>;
  /** 冲突解决：以云端为准（丢弃本地目录改动） */
  resolveTreeConflictKeepServer: () => Promise<void>;
  /** 冲突解决：以本地为准（覆盖云端） */
  resolveTreeConflictKeepLocal: () => Promise<void>;
  /** 恢复目录历史版本（条件写；若期间云端又变则转入冲突流程，不静默覆盖） */
  restoreTreeVersion: (tree: NoteTree) => Promise<void>;

  addFolder: (parentId: string | null, title: string) => Promise<void>;
  addNote: (parentId: string | null, title: string) => Promise<string>;
  /** 导入：用给定 blocks 新建笔记 */
  createNoteWithContent: (
    parentId: string | null,
    title: string,
    blocks: Block[],
  ) => Promise<string>;
  renameNode: (id: string, title: string) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  moveNode: (id: string, newParentId: string | null, index: number) => Promise<void>;

  updateActiveBlocks: (blocks: Block[]) => void;
  updateActiveEdges: (edges: BlockEdge[]) => void;
  updateActiveStage: (stage: NoteStage) => void;
  setActiveTitle: (title: string) => void;
  setActiveVisibility: (visibility: NoteVisibility) => void;
}

export interface SearchHit {
  id: string;
  title: string;
  snippet: string;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** 目录结构/标题等变更后才需要额外 PUT /api/tree（正文编辑由笔记 PUT 覆盖） */
let treeDirty = false;

function markTreeDirty() {
  treeDirty = true;
}

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
  treeRev: null,
  treeLocalOnly: false,
  treeConflict: null,

  async init(session) {
    const repo = makeRepository(session);
    treeDirty = false;
    setState({ repo, treeReady: false, treeLoading: true, saveError: false, treeConflict: null });
    // loadTree 自身不再抛错：失败时进入"只读本地"，由下面的状态与提示告知用户
    const tree = await repo.loadTree();
    const treeLocalOnly = repo.isLocalOnly();
    setState({
      tree,
      treeReady: true,
      treeLoading: false,
      treeRev: repo.getTreeRev(),
      treeLocalOnly,
    });
    if (treeLocalOnly) {
      toast('error', '云端目录不可用，已进入本地模式（目录暂不同步）');
    }
  },

  async resolveTreeConflictKeepServer() {
    const { repo } = getState();
    const tree = await repo.reloadTree();
    setState({
      tree,
      treeRev: repo.getTreeRev(),
      treeLocalOnly: repo.isLocalOnly(),
      treeConflict: null,
    });
    toast('success', '已改用云端目录');
  },

  async resolveTreeConflictKeepLocal() {
    const { repo, treeConflict } = getState();
    if (!treeConflict) return;
    try {
      const rev = await repo.overwriteTree(treeConflict.localTree, treeConflict.serverRev);
      setState({ treeRev: rev, treeLocalOnly: false, treeConflict: null });
      toast('success', '已用本地目录覆盖云端');
    } catch (e) {
      if (e instanceof TreeConflictError) {
        // 期间云端又被改：更新服务端 revision，继续等用户决定
        setState({ treeConflict: { ...treeConflict, serverRev: e.rev } });
        toast('error', '云端目录又被修改，请重新确认');
        return;
      }
      toast('error', '写入失败，本地目录仍保留');
    }
  },

  async restoreTreeVersion(next) {
    const { repo, treeRev } = getState();
    try {
      const rev = await repo.overwriteTree(next, treeRev);
      setState({ tree: next, treeRev: rev, treeLocalOnly: false, treeConflict: null });
      toast('success', '已恢复该版本目录');
    } catch (e) {
      if (e instanceof TreeConflictError) {
        // 不静默覆盖：转入统一的冲突流程，由用户决定
        setState({ treeConflict: { localTree: next, serverRev: e.rev } });
        toast('error', '云端目录已被其他设备修改，请选择保留哪一份');
        return;
      }
      throw e;
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
    const { tree } = getState();
    const node: TreeNode = { id: uid('fld'), kind: 'folder', title, children: [] };
    const next = { ...tree, roots: insertChild(tree.roots, parentId, node) };
    setState({ tree: next });
    await persistTree(next);
  },

  async addNote(parentId, title) {
    const { tree, repo } = getState();
    const id = uid('note');
    const node: TreeNode = { id, kind: 'note', title, noteId: id, visibility: 'private' };
    const next = { ...tree, roots: insertChild(tree.roots, parentId, node) };
    const note = createEmptyNote(id, title);
    setState({ tree: next, activeNoteId: id, activeNote: note, noteLoading: false });
    void persistTree(next);
    void repo.saveNote(note);
    return id;
  },

  async createNoteWithContent(parentId, title, blocks) {
    const { tree, repo } = getState();
    const id = uid('note');
    const node: TreeNode = { id, kind: 'note', title, noteId: id, visibility: 'private' };
    const next = { ...tree, roots: insertChild(tree.roots, parentId, node) };
    const note: Note = {
      ...createEmptyNote(id, title),
      blocks: blocks.length > 0 ? blocks : createEmptyNote(id, title).blocks,
      updatedAt: new Date().toISOString(),
    };
    setState({ tree: next, activeNoteId: id, activeNote: note, noteLoading: false });
    await persistTree(next);
    const result = await repo.saveNote(note);
    if (!result.noteOk && repo.authed) {
      toast('error', '云端保存失败，内容已存本地');
    }
    return id;
  },

  async renameNode(id, title) {
    const { tree } = getState();
    const next = { ...tree, roots: patchNode(tree.roots, id, { title }) };
    setState({ tree: next });
    await persistTree(next);
  },

  async deleteNode(id) {
    const { tree, repo, activeNoteId } = getState();
    // 删除栏目/笔记会连带丢弃锚在它及其后代上的任务（不可恢复），
    // 所以先把数量算出来告诉用户——这是本模块唯一的数据丢失路径
    const subtreeIds = new Set(collectSubtreeNodeIds(tree, id));
    const anchored = usePlanStore.getState().countAnchored(subtreeIds);
    if (anchored > 0) {
      const label = findNode(tree.roots, id)?.title ?? '该项';
      const ok = window.confirm(
        `删除「${label}」会同时丢弃其下 ${anchored} 条任务规划，且无法恢复。确定删除吗？`,
      );
      if (!ok) return;
    }
    const [roots] = removeNode(tree.roots, id);
    const next = { ...tree, roots };
    setState({ tree: next, ...(activeNoteId === id ? { activeNoteId: null, activeNote: null } : {}) });
    await persistTree(next);
    await repo.deleteNote(id);
    if (anchored > 0) usePlanStore.getState().removeAnchored(subtreeIds);
  },

  async moveNode(id, newParentId, index) {
    const { tree } = getState();
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
    await persistTree(next);
  },

  updateActiveBlocks(blocks) {
    const { activeNote } = getState();
    if (!activeNote) return;
    const ids = new Set(blocks.map((b) => b.id));
    const edges = (activeNote.edges ?? []).filter((e) => ids.has(e.from) && ids.has(e.to));
    const updated: Note = {
      ...activeNote,
      blocks,
      edges,
      updatedAt: new Date().toISOString(),
    };
    setState({ activeNote: updated });
    scheduleSave(getState);
  },

  updateActiveEdges(edges) {
    const { activeNote } = getState();
    if (!activeNote) return;
    const updated: Note = {
      ...activeNote,
      edges,
      updatedAt: new Date().toISOString(),
    };
    setState({ activeNote: updated });
    scheduleSave(getState);
  },

  updateActiveStage(stage) {
    const { activeNote } = getState();
    if (!activeNote) return;
    const updated: Note = { ...activeNote, stage, updatedAt: new Date().toISOString() };
    setState({ activeNote: updated });
    scheduleSave(getState);
  },

  setActiveTitle(title) {
    const { activeNote, tree } = getState();
    if (!activeNote) return;
    const updated: Note = { ...activeNote, title, updatedAt: new Date().toISOString() };
    const next = { ...tree, roots: patchNode(tree.roots, activeNote.id, { title }) };
    setState({ activeNote: updated, tree: next });
    markTreeDirty();
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
    // 可见性由笔记 PUT 在 Worker 侧同步到 tree，无需额外 saveTree
    scheduleSave(getState);
  },
}));

/** 防抖保存：编辑停止 800ms 后落盘（本地 + 远端）；含 blob: 预览时推迟 */
function scheduleSave(getState: () => NotesState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const { repo, activeNote, tree } = getState();
    if (!activeNote) return;
    if (noteHasTransientImageSrc(activeNote)) {
      scheduleSave(getState);
      return;
    }
    useNotesStore.setState({ saving: true, saveError: false });
    const result = await repo.saveNote(activeNote);
    if (treeDirty) {
      await persistTree(tree);
      treeDirty = false;
    }
    useNotesStore.setState({ saving: false, saveError: !result.noteOk });
    if (!result.noteOk && repo.authed) {
      toast('error', '云端保存失败，内容已存本地');
    }
  }, 800);
}

/**
 * 目录树写入的唯一出口。
 *
 * 冲突**不抛出**，而是进入待决状态并暂停后续树写入：界面据此询问用户保留哪一份，
 * 期间本地树与 IndexedDB 都保持不动，用户继续编辑不会丢内容。
 */
async function persistTree(tree: NoteTree): Promise<void> {
  const state = useNotesStore.getState();
  // 冲突未决：暂停远端树写入（本地树已由 setState 更新并写入 IndexedDB）
  if (state.treeConflict) return;
  try {
    await state.repo.saveTree(tree);
    useNotesStore.setState({
      treeRev: state.repo.getTreeRev(),
      treeLocalOnly: state.repo.isLocalOnly(),
    });
  } catch (e) {
    if (e instanceof TreeConflictError) {
      useNotesStore.setState({ treeConflict: { localTree: tree, serverRev: e.rev } });
      toast('error', '云端目录已被其他设备修改，请选择保留哪一份');
      return;
    }
    throw e;
  }
}

function blocksToText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      if ('text' in b && typeof b.text === 'string') return b.text;
      return '';
    })
    .join('\n');
}
