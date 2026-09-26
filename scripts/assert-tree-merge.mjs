/**
 * 最小断言：目录树并集合并（mergeTreeById）。
 * 用法：npm run build --workspace packages/shared && node scripts/assert-tree-merge.mjs
 */
import { mergeTreeById } from '../packages/shared/dist/index.js';

let count = 0;
function assert(cond, msg) {
  count += 1;
  if (!cond) throw new Error(`✗ ${msg}`);
}
function eq(actual, expected, msg) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${msg}（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）`,
  );
}
function allIds(tree) {
  const out = [];
  (function walk(nodes) {
    for (const n of nodes) {
      out.push(n.id);
      if (n.children) walk(n.children);
    }
  })(tree.roots);
  return out;
}
function find(tree, id) {
  let hit;
  (function walk(nodes) {
    for (const n of nodes) {
      if (n.id === id) hit = n;
      if (n.children) walk(n.children);
    }
  })(tree.roots);
  return hit;
}
function childTitles(node) {
  return (node.children ?? []).map((c) => c.title);
}

/* ── 云端（target）：F1 > {N1, F2 > F3 > N2}；F9 ── */
const cloud = {
  schemaVersion: 1,
  roots: [
    {
      id: 'F1',
      kind: 'folder',
      title: '基础游戏开发',
      children: [
        { id: 'N1', kind: 'note', title: '渲染开发', noteId: 'n1', visibility: 'private' },
        {
          id: 'F2',
          kind: 'folder',
          title: 'Gameplay开发',
          children: [
            {
              id: 'F3',
              kind: 'folder',
              title: '脚本工具',
              children: [{ id: 'N2', kind: 'note', title: '原理', noteId: 'n2', visibility: 'private' }],
            },
          ],
        },
      ],
    },
    { id: 'F9', kind: 'folder', title: '开发者大类', children: [] },
  ],
};

/* ── 本地（source）：F1（标题不同 + 新增子 F8）、F20 子树、N30、F3（被移动过位置 + 新增子 N40） ── */
const local = {
  schemaVersion: 1,
  roots: [
    {
      id: 'F1',
      kind: 'folder',
      title: '基础游戏开发（本地改过名）',
      children: [{ id: 'F8', kind: 'folder', title: '基础', children: [] }],
    },
    {
      id: 'F20',
      kind: 'folder',
      title: '我思故我在',
      children: [
        {
          id: 'F21',
          kind: 'folder',
          title: 'Who/What/How',
          children: [
            {
              id: 'F22',
              kind: 'folder',
              title: '我是谁',
              children: [{ id: 'N23', kind: 'note', title: '总纲', noteId: 'n23', visibility: 'private' }],
            },
          ],
        },
      ],
    },
    { id: 'N30', kind: 'note', title: '新笔记', noteId: 'n30', visibility: 'private' },
    {
      id: 'F3',
      kind: 'folder',
      title: '脚本工具',
      children: [{ id: 'N40', kind: 'note', title: '本地新增', noteId: 'n40', visibility: 'private' }],
    },
  ],
};

const cloudBefore = JSON.stringify(cloud);
const localBefore = JSON.stringify(local);

const { tree, stats } = mergeTreeById(cloud, local);

/* ── 1.4 两棵不相交的树：双方节点都在 ── */
for (const id of ['F1', 'N1', 'F2', 'F3', 'N2', 'F9', 'F8', 'F20', 'F21', 'F22', 'N23', 'N30', 'N40']) {
  assert(find(tree, id), `1.4 合并结果应包含节点 ${id}`);
}
eq(find(tree, 'F20').children[0].title, 'Who/What/How', '1.4 新接入的子树结构完整');

/* ── 1.5 共有 id 只保留一个节点，且保留 target 的布局 ── */
eq(allIds(tree).filter((id) => id === 'F1').length, 1, '1.5 共有 id F1 只保留一个');
eq(find(tree, 'F1').title, '基础游戏开发', '1.5 target 的标题未被 source 覆盖（只增不改）');
eq(childTitles(find(tree, 'F1')), ['渲染开发', 'Gameplay开发', '基础'], '1.5 target 原有子节点顺序不变，新增子节点追加在末尾');
eq(childTitles(find(tree, 'F3')), ['原理', '本地新增'], '1.5 父级已存在时合并点跟随 target 的位置');
eq(allIds(tree).filter((id) => id === 'F3').length, 1, '1.5 被移动过的 F3 不会在根层复活第二份');
eq(tree.roots.map((n) => n.id), ['F1', 'F9', 'F20', 'N30'], '1.5 根层顺序：target 原序 + 新增追加在末尾');

/* ── 1.6 source 为空时 target 不被改动 ── */
const noop = mergeTreeById(cloud, { schemaVersion: 1, roots: [] });
eq(JSON.stringify(noop.tree), cloudBefore, '1.6 空 source 时结果与 target 完全一致');
eq(noop.stats, { addedRoots: 0, addedNodes: 0 }, '1.6 空 source 时统计为零');

/* ── 1.7 无重复 id；入参不被修改 ── */
const ids = allIds(tree);
eq(ids.length, new Set(ids).size, '1.7 合并结果无重复 id');
eq(JSON.stringify(cloud), cloudBefore, '1.7 不修改 target 入参');
eq(JSON.stringify(local), localBefore, '1.7 不修改 source 入参');

/* ── 统计口径 ── */
eq(stats.addedRoots, 2, '统计：新增根节点数（F20、N30）');
eq(stats.addedNodes, 7, '统计：新增节点总数（F8、F20/F21/F22/N23、N30、N40）');

console.log(`✓ assert-tree-merge: ${count} 条断言通过`);
