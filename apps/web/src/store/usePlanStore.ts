import { create } from 'zustand';
import type { NoteTree, PlanDoc, PlanNode, TaskPriority, TreeNode } from '@webbook/shared';
import {
  collectDescendantNodeIds,
  collectSubtreeNodeIds,
  createEmptyPlan,
  createTask,
  findTask,
  insertTask,
  moveTask as moveTaskInPlan,
  removeAnchoredTasks as removeAnchoredInPlan,
  removeTask as removeTaskInPlan,
  updateTask as updateTaskInPlan,
  countAnchoredTasks as countAnchoredInPlan,
  computeProgress,
} from '@webbook/shared';
import { apiClient, PlanConflictError } from '@/lib/api';
import { useNotesStore } from '@/store/useNotesStore';
import { toast } from '@/store/useToastStore';
import { uid } from '@/lib/id';

/** 规划范围：某个笔记/栏目，或全库 */
export type PlanScope = { kind: 'node'; nodeId: string } | { kind: 'all' };

/** 被删任务及其原始位置，供撤销原样还原 */
export interface RemovedTaskLocation {
  node: PlanNode;
  parentTaskId: string | null;
  index: number;
}

export interface TaskDraft {
  title: string;
  dueAt?: string;
  priority?: TaskPriority;
  /** 从全局中心创建时可直接绑定到某个笔记/栏目，省掉"先建再挂"两步 */
  anchorNodeId?: string;
}

interface PlanState {
  plan: PlanDoc;
  /** 服务端 revision；null = 文件尚不存在 */
  baseSha: string | null;
  loading: boolean;
  saving: boolean;
  saveError: boolean;
  open: boolean;
  scope: PlanScope;
  /** 最近一次失败原因，供 UI 提示 */
  lastError: string | null;

  load: () => Promise<void>;
  openPlanner: (scope: PlanScope) => void;
  closePlanner: () => void;

  addTask: (parentTaskId: string | null, draft: TaskDraft) => void;
  setTitle: (taskId: string, title: string) => void;
  setNote: (taskId: string, note: string) => void;
  setDueAt: (taskId: string, dueAt: string | undefined) => void;
  setPriority: (taskId: string, priority: TaskPriority) => void;
  toggleDone: (taskId: string, done: boolean) => void;
  moveTask: (taskId: string, newParentId: string | null, index: number) => void;
  deleteTask: (taskId: string) => RemovedTaskLocation | null;
  restoreTask: (removed: RemovedTaskLocation) => void;
  setAnchor: (taskId: string, anchorNodeId: string | undefined) => void;

  countAnchored: (nodeIds: ReadonlySet<string>) => number;
  countAnchoredInNodeSubtree: (nodeId: string) => number;
  removeAnchored: (nodeIds: Set<string>) => void;
}

/**
 * 搜索/统计用的 session token。
 *
 * AuthContext 的 session 只存在 React state 里，store 取不到；这里由组件在初始化与
 * 认证变化时注入。刻意不把 token 放进 store state：它不该参与渲染，也不该被持久化。
 */
let token: string | null = null;

export function setPlanToken(next: string | null): void {
  token = next;
  if (!next) {
    usePlanStore.setState({
      plan: createEmptyPlan(),
      baseSha: null,
      open: false,
      lastError: null,
    });
  }
}

/**
 * 写入串行化。
 *
 * 每次变更都会 PUT 整份文档，两个并发请求会拿着同一个 baseSha 出发，
 * 第二个必然 409 并触发一次无意义的重放。把写入串成链，代价是保存排队，
 * 收益是冲突只可能来自"真的另一台设备"。
 */
let writeChain: Promise<void> = Promise.resolve();

function enqueueWrite(task: () => Promise<void>): void {
  writeChain = writeChain.then(task, task);
}

const CONFLICT_RETRY_LIMIT = 3;

/**
 * 一次变更的"意图"：把任意一份 plan 变成应用该变更后的新 plan。
 *
 * 冲突恢复必须重放**意图**而不是本地整份文档：后者会整体覆盖冲突窗口内
 * 另一台设备写入的内容，等于静默丢数据。
 */
type PlanMutation = (plan: PlanDoc) => PlanDoc;

export const usePlanStore = create<PlanState>((set, get) => ({
  plan: createEmptyPlan(),
  baseSha: null,
  loading: false,
  saving: false,
  saveError: false,
  open: false,
  scope: { kind: 'all' },
  lastError: null,

  async load() {
    if (!token) return;
    set({ loading: true, saveError: false, lastError: null });
    try {
      const res = await apiClient.loadPlan(token);
      set({ plan: res.plan, baseSha: res.baseSha, loading: false });
    } catch (e) {
      set({ loading: false, lastError: (e as Error).message });
      toast('error', '加载规划失败');
    }
  },

  openPlanner(scope) {
    set({ open: true, scope });
    void get().load();
  },

  closePlanner() {
    set({ open: false });
  },

  addTask(parentTaskId, draft) {
    const task = createTask({ id: uid('task'), title: draft.title.trim() || '新任务' });
    if (draft.dueAt) task.dueAt = draft.dueAt;
    if (draft.priority) task.priority = draft.priority;
    if (draft.anchorNodeId) task.anchorNodeId = draft.anchorNodeId;
    commit(set, (plan) => {
      const siblings = parentTaskId ? (findTask(plan.nodes, parentTaskId)?.children ?? []) : plan.nodes;
      return insertTask(plan, parentTaskId, siblings.length, task);
    });
  },

  setTitle(taskId, title) {
    commit(set, (plan) => updateTaskInPlan(plan, taskId, { title }));
  },

  setNote(taskId, note) {
    commit(set, (plan) => updateTaskInPlan(plan, taskId, { note: note.trim() || undefined }));
  },

  setDueAt(taskId, dueAt) {
    commit(set, (plan) => updateTaskInPlan(plan, taskId, { dueAt }));
  },

  setPriority(taskId, priority) {
    commit(set, (plan) => updateTaskInPlan(plan, taskId, { priority }));
  },

  toggleDone(taskId, done) {
    const patch: Partial<PlanNode> = done
      ? { done: true, doneAt: new Date().toISOString() }
      : { done: false, doneAt: undefined };
    // 取消完成必须清掉 doneAt，否则统计会把未完成任务算成"某天完成过"
    commit(set, (plan) => {
      const current = findTask(plan.nodes, taskId);
      if (!current || current.done === done) return plan;
      return updateTaskInPlan(plan, taskId, patch);
    });
  },

  moveTask(taskId, newParentId, index) {
    commit(set, (plan) => moveTaskInPlan(plan, taskId, newParentId, index));
  },

  deleteTask(taskId) {
    const { plan } = get();
    const parentTaskId = findParentTaskId(plan.nodes, taskId);
    const index = siblingIndex(plan.nodes, taskId);
    const removed = findTask(plan.nodes, taskId);
    if (!removed) return null;
    commit(set, (localPlan) => removeTaskInPlan(localPlan, taskId).plan);
    return { node: removed, parentTaskId, index };
  },

  restoreTask(removed) {
    commit(set, (plan) => insertTask(plan, removed.parentTaskId, removed.index, removed.node));
  },

  setAnchor(taskId, anchorNodeId) {
    commit(set, (plan) => updateTaskInPlan(plan, taskId, { anchorNodeId }));
  },

  countAnchored(nodeIds) {
    return countAnchoredInPlan(get().plan, nodeIds);
  },

  countAnchoredInNodeSubtree(nodeId) {
    const tree = useNotesStore.getState().tree;
    const ids = new Set(collectSubtreeNodeIds(tree, nodeId));
    return countAnchoredInPlan(get().plan, ids);
  },

  removeAnchored(nodeIds) {
    commit(set, (plan) => removeAnchoredInPlan(plan, nodeIds));
  },
}));

/** 找任务在计划树中的父 id（null = 根）；用于撤销时还原位置 */
function findParentTaskId(nodes: PlanNode[], taskId: string): string | null {
  for (const node of nodes) {
    if (node.children.some((child) => child.id === taskId)) return node.id;
    const found = findParentTaskId(node.children, taskId);
    if (found !== null) return found;
  }
  return null;
}

/** 任务在其所在列表中的下标 */
function siblingIndex(nodes: PlanNode[], taskId: string): number {
  const self = nodes.findIndex((n) => n.id === taskId);
  if (self >= 0) return self;
  for (const node of nodes) {
    const found = siblingIndex(node.children, taskId);
    if (found >= 0) return found;
  }
  return 0;
}

/** 乐观更新 + 排队落盘 */
function commit(set: (partial: Partial<PlanState>) => void, mutation: PlanMutation): void {
  set({ plan: mutation(usePlanStore.getState().plan) });
  persist(set, mutation, 0);
}

function persist(
  set: (partial: Partial<PlanState>) => void,
  mutation: PlanMutation,
  attempt: number,
): void {
  if (!token) return;
  enqueueWrite(async () => {
    if (!token) return;
    usePlanStore.setState({ saving: true });
    const current = usePlanStore.getState();
    try {
      const res = await apiClient.savePlan(token, current.plan, current.baseSha);
      usePlanStore.setState({ saving: false, saveError: false, baseSha: res.baseSha });
    } catch (e) {
      if (e instanceof PlanConflictError && attempt < CONFLICT_RETRY_LIMIT) {
        // 冲突：别的设备先写了。重拉服务端最新版，把**本次意图**重放在它之上，
        // 而不是把本地整份文档写回去——后者会覆盖掉对方刚写入的内容。
        try {
          const fresh = await apiClient.loadPlan(token);
          usePlanStore.setState({ plan: mutation(fresh.plan), baseSha: fresh.baseSha });
        } catch {
          /* 重拉失败则沿用旧状态，下一轮仍会 409 并继续退避 */
        }
        return persist(set, mutation, attempt + 1);
      }
      usePlanStore.setState({ saving: false, saveError: true, lastError: (e as Error).message });
      toast('error', '规划未同步，已保留本地改动');
    }
  });
}

/**
 * 仅供本地验证挂载点使用：注入计划内容与 scope，绕过认证与网络。
 * 正常渲染路径不会调用它。
 */
export function setPlanStateForTest(patch: {
  plan?: PlanDoc;
  open?: boolean;
  scope?: PlanScope;
  baseSha?: string | null;
}): void {
  usePlanStore.setState({
    ...(patch.plan !== undefined ? { plan: patch.plan } : {}),
    ...(patch.open !== undefined ? { open: patch.open } : {}),
    ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
    ...(patch.baseSha !== undefined ? { baseSha: patch.baseSha } : {}),
    loading: false,
  });
}

/* ────────────────────────── 供 UI 计算的选择器 ────────────────────────── */

/**
 * 当前 scope 下的可见任务。
 *
 * 节点 scope：锚在该节点及其全部后代上的任务（design D3）。聚合在前端完成，
 * Worker 不需要知道笔记树长什么样。
 *
 * tree 由调用方传入而非在此读取：在渲染期读另一个 store 的 getState() 不会建立订阅，
 * 拖拽移动栏目后规划弹窗不会重渲染。
 */
export function visibleTasksForScope(plan: PlanDoc, scope: PlanScope, tree: NoteTree): PlanNode[] {
  if (scope.kind === 'all') return plan.nodes;
  const anchorIds = new Set(collectSubtreeNodeIds(tree, scope.nodeId));
  return plan.nodes.filter((node) => visibleInScope(node, anchorIds));
}

function visibleInScope(node: PlanNode, anchorIds: ReadonlySet<string>): boolean {
  if (node.anchorNodeId !== undefined && anchorIds.has(node.anchorNodeId)) return true;
  return node.children.some((child) => visibleInScope(child, anchorIds));
}

/** 当前 scope 的标题，用于弹窗抬头 */
export function scopeLabel(scope: PlanScope, tree: NoteTree): string {
  if (scope.kind === 'all') return '全部任务';
  return findNodeTitle(tree.roots, scope.nodeId) ?? '任务规划';
}

function findNodeTitle(nodes: TreeNode[], id: string): string | null {
  for (const node of nodes) {
    if (node.id === id) return node.title;
    const found = findNodeTitle(node.children ?? [], id);
    if (found) return found;
  }
  return null;
}

/** scope 内未完成任务树（TODO tab 用；已完成任务沉到「已完成」栏） */
export function unfinishedTasks(nodes: PlanNode[]): PlanNode[] {
  const filter = (list: PlanNode[]): PlanNode[] => {
    const out: PlanNode[] = [];
    for (const node of list) {
      const children = filter(node.children);
      if (node.done && children.length === 0) continue;
      out.push({ ...node, children });
    }
    return out;
  };
  return filter(nodes);
}

/** scope 内已完成任务，按完成时间倒序 */
export function completedTasks(nodes: PlanNode[], sinceDays?: number): PlanNode[] {
  const all: PlanNode[] = [];
  const walk = (list: PlanNode[]) => {
    for (const node of list) {
      if (node.done) all.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  const filtered =
    sinceDays === undefined
      ? all
      : all.filter((n) => {
          if (!n.doneAt) return false;
          return Date.now() - new Date(n.doneAt).getTime() <= sinceDays * 24 * 60 * 60 * 1000;
        });
  return filtered.sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
}

export { computeProgress, collectDescendantNodeIds };
