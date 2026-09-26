import type { NoteTree, TreeNode } from './tree.js';

/**
 * 任务规划：整棵计划树存在单个 plan.json 里（见 openspec/changes/webbook-node-planner/design.md D1）。
 *
 * 两套时间语义刻意混用，实现时必须保持一致：
 * - dueAt 是"哪一天"，用本地日期串 YYYY-MM-DD，字符串比较，不引入时区
 * - createdAt / doneAt 是"什么时候发生的"，用完整 ISO 时刻
 */
export const PLAN_SCHEMA_VERSION = 1;

export const TASK_PRIORITIES = ['p0', 'p1', 'p2', 'none'] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** 任务优先级排序权重：p0 最靠前 */
export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  p0: 0,
  p1: 1,
  p2: 2,
  none: 3,
};

export interface PlanNode {
  id: string;
  title: string;
  /** 自由备注 */
  note?: string;
  /** 锚到 TreeNode.id；缺省 = 未归类 */
  anchorNodeId?: string;
  done: boolean;
  createdAt: string;
  /** 完成时刻；未完成时必须缺省（取消勾选要清掉） */
  doneAt?: string;
  /** 计划完成日期，本地日期串 YYYY-MM-DD */
  dueAt?: string;
  priority: TaskPriority;
  children: PlanNode[];
}

export interface PlanDoc {
  schemaVersion: number;
  /** 森林：可有多个根任务 */
  nodes: PlanNode[];
  /** 旧 reminders 已并入的一次性标记 */
  migratedReminders?: boolean;
}

export function createEmptyPlan(): PlanDoc {
  return { schemaVersion: PLAN_SCHEMA_VERSION, nodes: [] };
}

export function createTask(partial: Partial<PlanNode> & { id: string; title: string }): PlanNode {
  const node: PlanNode = {
    id: partial.id,
    title: partial.title,
    done: partial.done ?? false,
    createdAt: partial.createdAt ?? new Date().toISOString(),
    priority: partial.priority ?? 'none',
    children: partial.children ?? [],
  };
  if (partial.note !== undefined) node.note = partial.note;
  if (partial.anchorNodeId !== undefined) node.anchorNodeId = partial.anchorNodeId;
  if (partial.dueAt !== undefined) node.dueAt = partial.dueAt;
  // 只有真的完成才保留 doneAt；否则取消勾选后残留的完成时间会污染统计
  if (node.done && partial.doneAt !== undefined) node.doneAt = partial.doneAt;
  return node;
}

function asPriority(raw: unknown): TaskPriority {
  return typeof raw === 'string' && (TASK_PRIORITIES as readonly string[]).includes(raw)
    ? (raw as TaskPriority)
    : 'none';
}

function optionalString(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

/** 单节点迁移：补齐缺失字段、丢弃非法值，保留 id / 嵌套 / 完成态 */
export function normalizePlanNode(raw: unknown): PlanNode | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const done = r.done === true;
  const childrenRaw = Array.isArray(r.children) ? r.children : [];
  const children: PlanNode[] = [];
  for (const child of childrenRaw) {
    const normalized = normalizePlanNode(child);
    if (normalized) children.push(normalized);
  }
  const node: PlanNode = {
    id: r.id,
    title: typeof r.title === 'string' && r.title ? r.title : '未命名任务',
    done,
    createdAt: optionalString(r.createdAt) ?? new Date().toISOString(),
    priority: asPriority(r.priority),
    children,
  };
  const note = optionalString(r.note);
  if (note !== undefined) node.note = note;
  const anchorNodeId = optionalString(r.anchorNodeId);
  if (anchorNodeId !== undefined) node.anchorNodeId = anchorNodeId;
  const dueAt = optionalString(r.dueAt);
  if (dueAt !== undefined) node.dueAt = dueAt;
  const doneAt = optionalString(r.doneAt);
  if (done && doneAt !== undefined) node.doneAt = doneAt;
  return node;
}

/** 按 schemaVersion 迁移到当前版本；容忍未知字段，不因缺字段报错 */
export function normalizePlan(raw: unknown): PlanDoc {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const nodesRaw = Array.isArray(r.nodes) ? r.nodes : [];
  const nodes: PlanNode[] = [];
  for (const node of nodesRaw) {
    const normalized = normalizePlanNode(node);
    if (normalized) nodes.push(normalized);
  }
  const plan: PlanDoc = { schemaVersion: PLAN_SCHEMA_VERSION, nodes };
  if (r.migratedReminders === true) plan.migratedReminders = true;
  return plan;
}

/* ────────────────────────── 笔记树遍历 ────────────────────────── */

function findTreeNode(nodes: TreeNode[], id: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findTreeNode(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** 某节点的全部后代 id（不含自身） */
export function collectDescendantNodeIds(tree: NoteTree, nodeId: string): string[] {
  const node = findTreeNode(tree.roots, nodeId);
  if (!node) return [];
  const out: string[] = [];
  const walk = (children: TreeNode[] | undefined) => {
    if (!children) return;
    for (const child of children) {
      out.push(child.id);
      walk(child.children);
    }
  };
  walk(node.children);
  return out;
}

/** 某节点及其全部后代 id（含自身） */
export function collectSubtreeNodeIds(tree: NoteTree, nodeId: string): string[] {
  const node = findTreeNode(tree.roots, nodeId);
  if (!node) return [];
  return [node.id, ...collectDescendantNodeIds(tree, nodeId)];
}

/** 树中全部节点 id */
export function collectAllNodeIds(tree: NoteTree): string[] {
  const out: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      out.push(node.id);
      walk(node.children ?? []);
    }
  };
  walk(tree.roots);
  return out;
}

/* ────────────────────────── 锚定与可见集 ────────────────────────── */

/**
 * 取锚点落在 visibleAnchorIds 内的任务子树（design D3）。
 * 祖先链上有锚点的任务，其子孙一并可见——"作为子级"创建的任务不带锚点也应当出现在父任务的规划里。
 * 传入空集合得到的是未归类任务。
 */
export function selectVisibleTasks(plan: PlanDoc, visibleAnchorIds: ReadonlySet<string>): PlanNode[] {
  const out: PlanNode[] = [];
  for (const node of plan.nodes) {
    if (collectVisible(node, visibleAnchorIds)) out.push(node);
  }
  return out;
}

function collectVisible(node: PlanNode, visibleAnchorIds: ReadonlySet<string>): boolean {
  if (node.anchorNodeId !== undefined && visibleAnchorIds.has(node.anchorNodeId)) return true;
  return node.children.some((child) => collectVisible(child, visibleAnchorIds));
}

/** 未归类任务：自身及其祖先链上都没有锚点。这是排除语义，不能用 selectVisibleTasks(∅) 表达。 */
export function collectUnclassifiedTasks(plan: PlanDoc): PlanNode[] {
  const out: PlanNode[] = [];
  for (const node of plan.nodes) {
    if (isUnclassified(node)) out.push(node);
  }
  return out;
}

function isUnclassified(node: PlanNode): boolean {
  if (node.anchorNodeId !== undefined) return false;
  return node.children.every((child) => isUnclassified(child));
}

/* ────────────────────────── 进度与统计 ────────────────────────── */

export interface TaskProgress {
  done: number;
  total: number;
}

/** 逐条计数（父子都算，每条任务每个指标只贡献 1） */
export function flattenTasks(nodes: PlanNode[]): PlanNode[] {
  const out: PlanNode[] = [];
  const walk = (list: PlanNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/** 含自身的子树任务数 */
export function countSubtreeTasks(node: PlanNode): number {
  return 1 + countDescendantTasks(node);
}

/** 后代任务数（不含自身）——用于"将一并删除 N 条任务"提示 */
export function countDescendantTasks(node: PlanNode): number {
  let total = 0;
  for (const child of node.children) total += countSubtreeTasks(child);
  return total;
}

export function computeProgress(nodes: PlanNode[]): TaskProgress {
  const all = flattenTasks(nodes);
  return { done: all.filter((n) => n.done).length, total: all.length };
}

export interface PlanStats {
  total: number;
  done: number;
  /** 0–1；总数为 0 时为 0，绝不返回 NaN */
  completionRate: number;
  overdue: number;
  recentDone: number;
  /** 仅未完成任务 */
  byPriority: Record<TaskPriority, number>;
}

export const RECENT_DONE_DAYS = 7;

export function computePlanStats(nodes: PlanNode[], now: Date = new Date()): PlanStats {
  const all = flattenTasks(nodes);
  const byPriority: Record<TaskPriority, number> = { p0: 0, p1: 0, p2: 0, none: 0 };
  const today = toDateString(now);
  let done = 0;
  let overdue = 0;
  let recentDone = 0;

  for (const node of all) {
    if (node.done) {
      done += 1;
      if (node.doneAt !== undefined && isWithinLastDays(node.doneAt, RECENT_DONE_DAYS, now)) {
        recentDone += 1;
      }
    } else {
      byPriority[node.priority] += 1;
      if (isOverdue(node, today)) overdue += 1;
    }
  }

  const total = all.length;
  return {
    total,
    done,
    completionRate: total === 0 ? 0 : done / total,
    overdue,
    recentDone,
    byPriority,
  };
}

/* ────────────────────────── 日期工具 ────────────────────────── */

/** 本地日期串 YYYY-MM-DD（不用 toISOString，避免 UTC 偏移把"今天"算成前一天） */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 逾期：未完成、有计划日期、且计划日期早于今天。无 dueAt 的任务永不算逾期。 */
export function isOverdue(node: PlanNode, todayStr: string): boolean {
  return !node.done && node.dueAt !== undefined && node.dueAt < todayStr;
}

/** doneAt 是否落在最近 days 天内（滚动窗口，非自然日） */
export function isWithinLastDays(doneAt: string, days: number, now: Date = new Date()): boolean {
  const at = new Date(doneAt).getTime();
  if (Number.isNaN(at)) return false;
  return now.getTime() - at <= days * 24 * 60 * 60 * 1000;
}

/* ────────────────────────── 树操作（纯函数，不改入参） ────────────────────────── */

/** 在 parentTaskId 下（null = 根）的 index 位置插入 */
export function insertTask(
  plan: PlanDoc,
  parentTaskId: string | null,
  index: number,
  task: PlanNode,
): PlanDoc {
  if (parentTaskId === null) {
    const nodes = [...plan.nodes];
    nodes.splice(Math.max(0, Math.min(index, nodes.length)), 0, task);
    return { ...plan, nodes };
  }
  const place = (nodes: PlanNode[]): PlanNode[] =>
    nodes.map((node) => {
      if (node.id === parentTaskId) {
        const children = [...node.children];
        children.splice(Math.max(0, Math.min(index, children.length)), 0, task);
        return { ...node, children };
      }
      return { ...node, children: place(node.children) };
    });
  return { ...plan, nodes: place(plan.nodes) };
}

interface RemovedTask {
  roots: PlanNode[];
  removed: PlanNode | null;
  parentId: string | null;
  index: number;
}

function removeTaskInternal(list: PlanNode[], taskId: string, parentId: string | null): RemovedTask {
  const index = list.findIndex((n) => n.id === taskId);
  if (index >= 0) {
    const roots = [...list];
    const taken = roots.splice(index, 1)[0] ?? null;
    return { roots, removed: taken, parentId, index };
  }
  for (let i = 0; i < list.length; i++) {
    const node = list[i]!;
    const result = removeTaskInternal(node.children, taskId, node.id);
    if (result.removed) {
      const roots = [...list];
      roots[i] = { ...node, children: result.roots };
      return { roots, removed: result.removed, parentId: result.parentId, index: result.index };
    }
  }
  return { roots: list, removed: null, parentId: null, index: -1 };
}

/** 删除任务，返回新 plan 与被删子树（供撤销恢复） */
export function removeTask(plan: PlanDoc, taskId: string): { plan: PlanDoc; removed: PlanNode | null } {
  const result = removeTaskInternal(plan.nodes, taskId, null);
  if (!result.removed) return { plan, removed: null };
  return { plan: { ...plan, nodes: result.roots }, removed: result.removed };
}

function updateTaskInternal(list: PlanNode[], taskId: string, patch: Partial<PlanNode>): PlanNode[] {
  return list.map((node) => {
    if (node.id === taskId) return { ...node, ...patch, id: node.id, children: node.children };
    return { ...node, children: updateTaskInternal(node.children, taskId, patch) };
  });
}

/** 按 id 打补丁；id 与 children 不允许被 patch 改掉（移动请用 moveTask） */
export function updateTask(plan: PlanDoc, taskId: string, patch: Partial<PlanNode>): PlanDoc {
  const safe: Partial<PlanNode> = { ...patch };
  delete safe.id;
  delete safe.children;
  return { ...plan, nodes: updateTaskInternal(plan.nodes, taskId, safe) };
}

/**
 * 移动任务到 newParentId 下（null = 根）的 index 位置。
 *
 * index 的约定：**目标列表摘除该任务之后**的下标。同父级内后移时函数会自动左移一位，
 * 因此调用方只需传"落点在该列表中的序号"，不必自己补偿。
 *
 * 唯一必须拒绝的情况是"目标落在被移动任务的子树内"（会成自引用环）。
 * 反过来"目标包含被移动任务"是正常的同级排序，必须放行。
 */
export function moveTask(
  plan: PlanDoc,
  taskId: string,
  newParentId: string | null,
  index: number,
): PlanDoc {
  if (taskId === newParentId) return plan;
  if (newParentId !== null) {
    if (taskAncestorIds(plan.nodes, newParentId).includes(taskId)) return plan;
  }

  const removal = removeTaskInternal(plan.nodes, taskId, null);
  if (!removal.removed) return plan;
  const moved = removal.removed;

  // 同一父级内前移时，摘除已使后续下标左移一位
  let target = index;
  if (removal.parentId === newParentId && removal.index < index) target = index - 1;

  if (newParentId === null) {
    const nodes = [...removal.roots];
    nodes.splice(Math.max(0, Math.min(target, nodes.length)), 0, moved);
    return { ...plan, nodes };
  }
  const nodes = insertion(removal.roots, newParentId, target, moved);
  if (!nodes) return plan;
  return { ...plan, nodes };
}

function insertion(
  list: PlanNode[],
  parentId: string,
  index: number,
  moved: PlanNode,
): PlanNode[] | null {
  const found = { hit: false };
  const walk = (nodes: PlanNode[]): PlanNode[] =>
    nodes.map((node) => {
      if (node.id === parentId) {
        found.hit = true;
        const children = [...node.children];
        children.splice(Math.max(0, Math.min(index, children.length)), 0, moved);
        return { ...node, children };
      }
      return { ...node, children: walk(node.children) };
    });
  const out = walk(list);
  return found.hit ? out : null;
}

export function findTask(nodes: PlanNode[], taskId: string): PlanNode | undefined {
  for (const node of nodes) {
    if (node.id === taskId) return node;
    const found = findTask(node.children, taskId);
    if (found) return found;
  }
  return undefined;
}

/** 任务及其全部祖先 id（含自身），供移动合法性判断与 UI 折叠 */
export function taskAncestorIds(nodes: PlanNode[], taskId: string): string[] {
  const path: string[] = [];
  const walk = (list: PlanNode[], trail: string[]): boolean => {
    for (const node of list) {
      const next = [...trail, node.id];
      if (node.id === taskId) {
        path.push(...next);
        return true;
      }
      if (walk(node.children, next)) return true;
    }
    return false;
  };
  walk(nodes, []);
  return path;
}

/** 统计锚点落在给定集合内的任务总数（含嵌套），供栏目删除前提示 */
export function countAnchoredTasks(plan: PlanDoc, nodeIds: ReadonlySet<string>): number {
  return flattenTasks(selectVisibleTasks(plan, nodeIds)).length;
}

/**
 * 删除锚点落在给定集合内的全部任务，返回新 plan。
 *
 * 自身无锚、却因后代被删而变空的容器任务会一并移除——否则删除栏目后会在父级留下
 * 一串只有标题的空壳。原本就是叶子的无锚任务（用户自己建的未归类任务）不受影响。
 */
export function removeAnchoredTasks(plan: PlanDoc, nodeIds: ReadonlySet<string>): PlanDoc {
  const prune = (nodes: PlanNode[]): PlanNode[] => {
    const out: PlanNode[] = [];
    for (const node of nodes) {
      if (node.anchorNodeId !== undefined && nodeIds.has(node.anchorNodeId)) continue;
      const wasContainer = node.children.length > 0;
      const children = prune(node.children);
      if (wasContainer && children.length === 0) continue;
      out.push({ ...node, children });
    }
    return out;
  };
  return { ...plan, nodes: prune(plan.nodes) };
}

/* ────────────────────────── 旧 reminders 一次性迁移 ────────────────────────── */

/** 旧 reminders.json 的条目形状（该模块已下线，类型只用于迁移） */
export interface LegacyReminder {
  id?: string;
  noteId?: string;
  text?: string;
  createdAt?: string;
  done?: boolean;
}

export interface MergeRemindersResult {
  plan: PlanDoc;
  /** 实际并入的条目数；0 表示无需写回 */
  added: number;
}

/**
 * 把旧 reminders 并入规划（design D8）。
 *
 * 幂等性来自两处：`migratedReminders` 标记 + 按 id 去重，二者都不依赖 reminders 文件是否被删除。
 * 只做追加（push 无锚根任务）与置标记，不修改既有节点——迁移写坏老数据是不可接受的。
 *
 * 放在 shared 而非 Worker：Worker 与断言脚本跑同一份实现，迁移语义才有真实覆盖。
 */
export function mergeReminders(
  plan: PlanDoc,
  reminders: LegacyReminder[],
  now: string = new Date().toISOString(),
): MergeRemindersResult {
  const next: PlanDoc = { ...plan, nodes: [...plan.nodes], migratedReminders: true };
  const existing = new Set<string>();
  const collect = (nodes: PlanNode[]) => {
    for (const node of nodes) {
      existing.add(node.id);
      collect(node.children);
    }
  };
  collect(next.nodes);

  let added = 0;
  for (const reminder of reminders) {
    const id = typeof reminder.id === 'string' && reminder.id ? reminder.id : null;
    const text = typeof reminder.text === 'string' ? reminder.text.trim() : '';
    if (!id || !text) continue;
    if (existing.has(id)) continue;
    const done = reminder.done === true;
    const createdAt = reminder.createdAt ?? now;
    next.nodes.push({
      id,
      title: text,
      done,
      createdAt,
      // 已完成的历史条目拿不到真实完成时刻，用创建时间兜底，避免 doneAt 为空污染统计
      ...(done ? { doneAt: createdAt } : {}),
      priority: 'none',
      children: [],
    });
    existing.add(id);
    added += 1;
  }

  return { plan: next, added };
}
