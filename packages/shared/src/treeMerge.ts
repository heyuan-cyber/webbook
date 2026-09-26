import type { NoteTree, TreeNode } from './tree.js';

/** 并集合并的统计，用于在登录合并时向用户展示将要发生什么 */
export interface TreeMergeStats {
  /** 新增到根层的节点数 */
  addedRoots: number;
  /** 新增的节点总数（含其全部子孙） */
  addedNodes: number;
}

export interface TreeMergeResult {
  tree: NoteTree;
  stats: TreeMergeStats;
}

function cloneNode(node: TreeNode): TreeNode {
  const next: TreeNode = { ...node };
  if (node.children) next.children = node.children.map(cloneNode);
  return next;
}

function countNodes(node: TreeNode): number {
  let n = 1;
  if (node.children) {
    for (const c of node.children) n += countNodes(c);
  }
  return n;
}

/** 把一棵（已克隆的）树的全部节点按 id 建索引 */
function indexById(nodes: TreeNode[], index: Map<string, TreeNode>): void {
  for (const node of nodes) {
    index.set(node.id, node);
    if (node.children?.length) indexById(node.children, index);
  }
}

/**
 * 逐层合并：source 中 id 不在 target 里的节点整棵接入 target 的同层；
 * id 已存在的节点不重复接入，而是递归合并其 children。
 *
 * 注意：`index` 覆盖 target 的**整棵**树，因此当某个源节点的父级在 target 中
 * 被移动过位置时，合并点会跟随 target 的当前位置，而不会把旧位置一起复活。
 */
function mergeLevel(
  targetChildren: TreeNode[],
  sourceChildren: TreeNode[] | undefined,
  index: Map<string, TreeNode>,
  stats: TreeMergeStats,
): void {
  if (!sourceChildren?.length) return;
  for (const source of sourceChildren) {
    const existing = index.get(source.id);
    if (existing) {
      if (source.children?.length) {
        if (!existing.children) existing.children = [];
        mergeLevel(existing.children, source.children, index, stats);
      }
      continue;
    }
    const clone = cloneNode(source);
    targetChildren.push(clone);
    indexById([clone], index);
    stats.addedNodes += countNodes(clone);
  }
}

/**
 * 按节点 id 对目录树做**增量并集**合并：以 `target` 为基准，把 `source` 中
 * 尚不存在的节点接入。
 *
 * 契约：
 * - 只增不改：`target` 中已有节点的顺序、标题、可见性等一律保持原样；
 * - 新增节点追加在其父级 children 的末尾；
 * - 两棵树共有的 id 只保留一个节点（采用 target 的那份），其子树继续递归合并；
 * - 不修改入参，返回新的树对象。
 *
 * 用途：游客草稿在登录时上传。这是唯一会发生「两棵都可能有内容」的合流点；
 * 常规自动保存不走合并，而是走带修订号的比对写入。
 */
export function mergeTreeById(target: NoteTree, source: NoteTree): TreeMergeResult {
  const merged: NoteTree = {
    ...target,
    roots: target.roots.map(cloneNode),
  };
  const index = new Map<string, TreeNode>();
  indexById(merged.roots, index);

  const stats: TreeMergeStats = { addedRoots: 0, addedNodes: 0 };
  const before = merged.roots.length;
  mergeLevel(merged.roots, source.roots, index, stats);
  stats.addedRoots = merged.roots.length - before;

  return { tree: merged, stats };
}
