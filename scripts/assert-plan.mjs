/**
 * 最小断言：任务规划纯函数（锚定聚合 / 统计口径 / 树操作 / 日期时区）。
 * 用法：npm run build --workspace packages/shared && node scripts/assert-plan.mjs
 */
import {
  collectDescendantNodeIds,
  collectSubtreeNodeIds,
  collectUnclassifiedTasks,
  computePlanStats,
  computeProgress,
  countAnchoredTasks,
  countDescendantTasks,
  createEmptyPlan,
  createTask,
  findTask,
  isOverdue,
  isWithinLastDays,
  moveTask,
  mergeReminders,
  normalizePlan,
  removeAnchoredTasks,
  removeTask,
  selectVisibleTasks,
  toDateString,
  updateTask,
  PLAN_SCHEMA_VERSION,
} from '../packages/shared/dist/index.js';

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

/* ── 笔记树 ── */
const tree = {
  schemaVersion: 1,
  roots: [
    {
      id: 'F1',
      kind: 'folder',
      title: '论文',
      children: [
        { id: 'F2', kind: 'folder', title: '第三章', children: [{ id: 'N3', kind: 'note', title: '草稿' }] },
        { id: 'N4', kind: 'note', title: '第四章' },
      ],
    },
    { id: 'F9', kind: 'folder', title: '杂项', children: [] },
  ],
};

eq(collectDescendantNodeIds(tree, 'F1').sort(), ['F2', 'N3', 'N4'], 'F1 全部后代（不含自身）');
eq(collectSubtreeNodeIds(tree, 'F1').sort(), ['F1', 'F2', 'N3', 'N4'], 'F1 子树含自身');
eq(collectDescendantNodeIds(tree, 'N4'), [], '叶子无后代');
eq(collectDescendantNodeIds(tree, '不存在'), [], '未知节点返回空');

/* ── 计划树 ── */
const t = (id, title, extra = {}) => createTask({ id, title, ...extra });
const plan = {
  schemaVersion: PLAN_SCHEMA_VERSION,
  nodes: [
    t('a', 'A', { anchorNodeId: 'N3', children: [t('a1', 'A1'), t('a2', 'A2')] }),
    t('b', 'B', { anchorNodeId: 'N4' }),
    t('c', 'C', { children: [t('c1', 'C1', { anchorNodeId: 'F2' })] }),
    t('d', 'D'),
  ],
};

eq(
  selectVisibleTasks(plan, new Set(['N3'])).map((n) => n.id),
  ['a'],
  '只看到锚在自己的任务',
);
eq(
  selectVisibleTasks(plan, new Set(['F1', 'F2', 'N3', 'N4'])).map((n) => n.id),
  ['a', 'b', 'c'],
  '栏目看到后代任务',
);
eq(
  selectVisibleTasks(plan, new Set(['F2'])).map((n) => n.id),
  ['c'],
  '祖先链锚点让子孙一并可见',
);
eq(
  selectVisibleTasks(plan, new Set(['F9'])),
  [],
  '无任务节点返回空',
);
eq(
  selectVisibleTasks(plan, new Set(['N4'])).map((n) => n.id),
  ['b'],
  '同级任务不串台',
);
eq(
  collectUnclassifiedTasks(plan).map((n) => n.id),
  ['d'],
  '未归类 = 自身与祖先链都无锚',
);
eq(
  collectUnclassifiedTasks({ schemaVersion: 1, nodes: [{ ...t('f', 'F'), children: [t('f1', 'F1', { anchorNodeId: 'N3' })] }] }).map((n) => n.id),
  [],
  '后代带锚的无锚父任务不算未归类（它会出现在该锚点的规划里）',
);
eq(
  collectUnclassifiedTasks({ schemaVersion: 1, nodes: [t('g', 'G', { children: [t('g1', 'G1')] })] }).map((n) => n.id),
  ['g'],
  '整棵子树都无锚时按根任务进未归类',
);

eq(computeProgress(plan.nodes), { done: 0, total: 7 }, '进度统计全部后代（a,a1,a2,b,c,c1,d）');
eq(countDescendantTasks(findTask(plan.nodes, 'a')), 2, '后代数不含自身');
eq(countDescendantTasks(findTask(plan.nodes, 'd')), 0, '叶子后代数为 0');

/* ── 完成回卷：只算进度 ── */
const rollup = {
  schemaVersion: 1,
  nodes: [t('p', 'P', { children: [t('k1', 'K1', { done: true, doneAt: '2026-01-01T00:00:00.000Z' }), t('k2', 'K2', { done: true, doneAt: '2026-01-01T00:00:00.000Z' })] })],
};
assert(findTask(rollup.nodes, 'p').done === false, '子任务全完成也不自动勾父任务');
eq(computeProgress(rollup.nodes), { done: 2, total: 3 }, '父任务仍计入未完成');

/* ── 统计口径 ── */
const now = new Date('2026-06-15T12:00:00.000Z');
const statsPlan = {
  schemaVersion: 1,
  nodes: [
    t('s1', 'S1', { done: true, doneAt: '2026-06-14T00:00:00.000Z' }),
    t('s2', 'S2', { done: true, doneAt: '2026-01-01T00:00:00.000Z' }),
    t('s3', 'S3', { dueAt: '2026-06-01', priority: 'p0' }),
    t('s4', 'S4', { dueAt: '2027-01-01', priority: 'p1' }),
    t('s5', 'S5', { priority: 'p0' }),
    t('s6', 'S6'),
  ],
};
const stats = computePlanStats(statsPlan.nodes, now);
eq(stats.total, 6, '统计总任务数');
eq(stats.done, 2, '统计已完成');
eq(stats.completionRate, 2 / 6, '统计完成率');
eq(stats.overdue, 1, '逾期只算未完成且有 dueAt 的');
eq(stats.recentDone, 1, '最近七天完成数');
eq(stats.byPriority, { p0: 2, p1: 1, p2: 0, none: 1 }, '未完成优先级分布');

const empty = computePlanStats([], now);
eq(empty.total, 0, '空 scope 总数为 0');
eq(empty.completionRate, 0, '空 scope 完成率为 0 而非 NaN');
assert(!Number.isNaN(empty.completionRate), '完成率不得为 NaN');
eq(empty.byPriority, { p0: 0, p1: 0, p2: 0, none: 0 }, '空 scope 优先级全零');

/* ── 日期与时区 ── */
const lateNight = new Date(2026, 5, 15, 23, 30, 0); // 本地 2026-06-15 23:30
eq(toDateString(lateNight), '2026-06-15', '深夜仍是本地当天（不用 UTC 偏移）');
assert(isOverdue(t('x', 'X', { dueAt: '2026-06-14' }), '2026-06-15') === true, '昨天到期算逾期');
assert(isOverdue(t('x', 'X', { dueAt: '2026-06-15' }), '2026-06-15') === false, '今天到期不算逾期');
assert(isOverdue(t('x', 'X'), '2026-06-15') === false, '无 dueAt 永不算逾期');
assert(
  isWithinLastDays('2026-06-10T00:00:00.000Z', 7, new Date('2026-06-15T12:00:00.000Z')) === true,
  '窗口内算最近完成',
);
assert(
  isWithinLastDays('2026-06-01T00:00:00.000Z', 7, new Date('2026-06-15T12:00:00.000Z')) === false,
  '窗口外不算最近完成',
);

/* ── 迁移与容错 ── */
const legacy = normalizePlan({
  schemaVersion: 0,
  nodes: [
    { id: 'r1', text: '旧数据没有这些字段', unknownField: 1 },
    { id: 'r2', done: true, doneAt: '2026-01-02T00:00:00.000Z', priority: '不合法' },
    { title: '没有 id 应被丢弃' },
    null,
  ],
  migratedReminders: true,
});
eq(legacy.schemaVersion, PLAN_SCHEMA_VERSION, '迁移到当前 schemaVersion');
eq(legacy.nodes.map((n) => n.id), ['r1', 'r2'], '缺 id 的节点被丢弃，其余保留');
eq(legacy.nodes[0].priority, 'none', '缺优先级补默认值');
eq(legacy.nodes[1].priority, 'none', '非法优先级回落默认值');
assert(legacy.nodes[1].doneAt === '2026-01-02T00:00:00.000Z', '已完成保留 doneAt');
assert(legacy.nodes[0].doneAt === undefined, '未完成不得有 doneAt');
assert(legacy.migratedReminders === true, '保留迁移标记');
eq(normalizePlan(null).nodes, [], '空输入返回空计划');
assert(createTask({ id: 'z', title: 'Z', done: false, doneAt: '2020-01-01T00:00:00.000Z' }).doneAt === undefined, '未完成时忽略传入的 doneAt');

/* ── 树操作不可变且不改入参 ── */
const snapshot = JSON.stringify(plan);
const added = moveTask(plan, 'b', 'a', 0);
eq(JSON.stringify(plan), snapshot, 'moveTask 不改动入参');
eq(findTask(added.nodes, 'a').children.map((n) => n.id), ['b', 'a1', 'a2'], '移到另一个父任务下');
eq(findTask(added.nodes, 'b').anchorNodeId, 'N4', '移动保留锚点');

const sameParent = moveTask(plan, 'a1', 'a', 2);
eq(findTask(sameParent.nodes, 'a').children.map((n) => n.id), ['a2', 'a1'], '同父级内 index=2 落到位（摘除后左移一位）');
eq(JSON.stringify(plan), snapshot, '同父级移动同样不改入参');

eq(moveTask(plan, 'a', 'a1', 0), plan, '拒绝移入自身后代');
eq(moveTask(plan, 'a', 'a', 0), plan, '拒绝移入自身');
eq(moveTask(plan, '不存在', null, 0), plan, '未知任务移动为无操作');

const rootMove = moveTask(plan, 'a1', null, 0);
eq(rootMove.nodes.map((n) => n.id), ['a1', 'a', 'b', 'c', 'd'], '移到根级');
eq(findTask(rootMove.nodes, 'a').children.map((n) => n.id), ['a2'], '原子级被摘除');
eq(JSON.stringify(plan), snapshot, '移出到根同样不改入参');

const { plan: afterRemove, removed } = removeTask(plan, 'a');
eq(removed.id, 'a', '返回被删子树供撤销');
eq(removed.children.length, 2, '被删子树保留完整嵌套');
eq(afterRemove.nodes.map((n) => n.id), ['b', 'c', 'd'], '删除后根级只剩其余任务');
assert(findTask(afterRemove.nodes, 'a1') === undefined, '子孙一并删除');
eq(JSON.stringify(plan), snapshot, 'removeTask 不改动入参');
eq(removeTask(plan, '不存在').removed, null, '删不存在的任务返回空');
eq(removeTask(plan, '不存在').plan, plan, '删不存在的任务不改动 plan');

/* ── 栏目删除的级联清理 ── */
const anchorIds = new Set(collectSubtreeNodeIds(tree, 'F1'));
// a 锚在 N3（+其子 a1/a2 随父可见）、b 锚在 N4、c 因后代 c1 锚在 F2 而整棵可见
// = a, a1, a2, b, c, c1 = 6；d 无锚为未归类，不计入
eq(countAnchoredTasks(plan, anchorIds), 6, 'F1 子树内的任务数（含随父可见的子孙）');
const cleaned = removeAnchoredTasks(plan, anchorIds);
eq(cleaned.nodes.map((n) => n.id), ['d'], '子树外与未归类任务不受影响，空壳容器一并清除');
eq(
  removeAnchoredTasks({ schemaVersion: 1, nodes: [t('leaf', '本就无子的未归类任务')] }, anchorIds).nodes.map((n) => n.id),
  ['leaf'],
  '原本就是叶子的未归类任务不被误删',
);
eq(removeAnchoredTasks(plan, new Set(collectSubtreeNodeIds(tree, 'F9'))), plan, '无任务的栏目删除不改动 plan');
eq(createEmptyPlan().nodes, [], '空计划构造正确');

/* ── 旧 reminders 迁移（覆盖 tasks 13.1–13.4 的逻辑部分）── */
const legacyReminders = [
  { id: 'r1', noteId: '__quick__', text: '买牛奶', createdAt: '2026-01-01T00:00:00.000Z', done: false },
  { id: 'r2', noteId: 'nX', text: '写周报', createdAt: '2026-01-02T00:00:00.000Z', done: true },
  { id: 'r3', noteId: 'nY', text: '   ', createdAt: '2026-01-03T00:00:00.000Z', done: false },
  { text: '没有 id 的条目', done: false },
];

const merge1 = mergeReminders(createEmptyPlan(), legacyReminders, '2026-06-01T00:00:00.000Z');
eq(merge1.added, 2, '只并入有 id 且有文本的条目');
eq(merge1.plan.nodes.map((n) => n.id), ['r1', 'r2'], '迁移条目按原 id 落为根任务');
eq(merge1.plan.nodes[0].title, '买牛奶', '任务标题取 reminder 文本');
eq(merge1.plan.nodes[0].done, false, '未完成条目迁移后仍未完成');
assert(merge1.plan.nodes[0].anchorNodeId === undefined, '迁移条目无锚 = 未归类');
eq(merge1.plan.nodes[0].priority, 'none', '迁移条目默认无优先级');
eq(merge1.plan.nodes[1].done, true, '已完成条目迁移后仍为已完成');
eq(merge1.plan.nodes[1].doneAt, '2026-01-02T00:00:00.000Z', '已完成条目带 doneAt（用创建时间兜底）');
assert(merge1.plan.migratedReminders === true, '置迁移标记');

// 幂等：再跑一次不应新增（13.2）
const merge2 = mergeReminders(merge1.plan, legacyReminders, '2026-06-01T00:00:00.000Z');
eq(merge2.added, 0, '重复迁移不新增条目（幂等）');
eq(merge2.plan.nodes.length, merge1.plan.nodes.length, '重复迁移后任务总数不变');
const merge3 = mergeReminders(merge2.plan, legacyReminders, '2026-06-01T00:00:00.000Z');
eq(merge3.plan.nodes.length, merge1.plan.nodes.length, '连续三次加载任务总数仍不变');

// 迁移不修改既有节点（13.3 的对应保障：只追加 + 置标记）
const preExisting = {
  schemaVersion: 1,
  nodes: [t('keep', '原有任务', { anchorNodeId: 'N1', priority: 'p1', dueAt: '2026-07-01' })],
};
const merge4 = mergeReminders(preExisting, legacyReminders, '2026-06-01T00:00:00.000Z');
eq(merge4.plan.nodes.map((n) => n.id), ['keep', 'r1', 'r2'], '既有任务保留在前，迁移条目追加在后');
const keptNode = merge4.plan.nodes[0];
eq(keptNode.anchorNodeId, 'N1', '迁移不改动既有任务的锚点');
eq(keptNode.priority, 'p1', '迁移不改动既有任务优先级');
eq(keptNode.dueAt, '2026-07-01', '迁移不改动既有任务计划日期');
eq(preExisting.nodes.length, 1, '迁移不改动入参 plan');
eq(mergeReminders(createEmptyPlan(), []).added, 0, '无 reminders 时不新增');
eq(mergeReminders(createEmptyPlan(), []).plan.migratedReminders, true, '即使无条目也置标记（避免每次重读旧文件）');

/* ── 归属（anchorNodeId）与任务树结构正交：拖动/编辑都不得改变归属 ── */
const anchorPlan = {
  schemaVersion: 1,
  nodes: [
    t('a1', '筐 A 的任务', { anchorNodeId: 'NODE_A', children: [t('a1c', 'A 的子任务', { anchorNodeId: 'NODE_A' })] }),
    t('b1', '筐 B 的任务', { anchorNodeId: 'NODE_B' }),
  ],
};
const anchorSnapshot = JSON.stringify(anchorPlan);

// 拖动到根级新位置：归属不变
const afterMoveRoot = moveTask(anchorPlan, 'a1c', null, 0);
eq(findTask(afterMoveRoot.nodes, 'a1c').anchorNodeId, 'NODE_A', '移出到根级不改归属');
eq(JSON.stringify(anchorPlan), anchorSnapshot, '移动不改动入参');

// 拖动改层级：归属不变
const afterMoveNest = moveTask(anchorPlan, 'b1', 'a1', 0);
eq(findTask(afterMoveNest.nodes, 'b1').anchorNodeId, 'NODE_B', '改层级不改归属');
eq(findTask(afterMoveNest.nodes, 'a1').anchorNodeId, 'NODE_A', '被挂上的父任务归属不变');

// 同父级内排序：归属不变
const afterReorder = moveTask(anchorPlan, 'a1c', 'a1', 0);
eq(findTask(afterReorder.nodes, 'a1c').anchorNodeId, 'NODE_A', '同父级排序不改归属');

// 编辑字段：归属不受影响
const afterTitle = updateTask(anchorPlan, 'b1', { title: '改过的标题' });
eq(findTask(afterTitle.nodes, 'b1').anchorNodeId, 'NODE_B', '改标题不改归属');
const afterDue = updateTask(anchorPlan, 'b1', { dueAt: '2026-12-01', priority: 'p0' });
eq(findTask(afterDue.nodes, 'b1').anchorNodeId, 'NODE_B', '改日期/优先级不改归属');
const afterDone = updateTask(anchorPlan, 'b1', { done: true, doneAt: '2026-12-02T00:00:00.000Z' });
eq(findTask(afterDone.nodes, 'b1').anchorNodeId, 'NODE_B', '标记完成不改归属');
eq(JSON.stringify(anchorPlan), anchorSnapshot, '编辑不改动入参');

// 改归属本身：只改锚点，不动结构
const afterReanchor = updateTask(anchorPlan, 'b1', { anchorNodeId: 'NODE_C' });
eq(findTask(afterReanchor.nodes, 'b1').anchorNodeId, 'NODE_C', '改归属只改锚点');
eq(findTask(afterReanchor.nodes, 'b1').children.length, 0, '改归属不动子树');
eq(afterReanchor.nodes.length, anchorPlan.nodes.length, '改归属不动顶层结构');

// 清除归属后该任务落进未归类
const afterClear = updateTask(anchorPlan, 'b1', { anchorNodeId: undefined });
eq(collectUnclassifiedTasks(afterClear).map((n) => n.id), ['b1'], '清除归属后进入未归类');
eq(collectUnclassifiedTasks(anchorPlan).map((n) => n.id), [], '未清除时不在未归类');

/* ── 归属决定可见性：子任务继承父任务的筐才能避免断树 ── */
const inheritPlan = {
  schemaVersion: 1,
  nodes: [
    t('p', '父任务', {
      anchorNodeId: 'NODE_A',
      children: [t('cA', '继承筐 A 的子任务', { anchorNodeId: 'NODE_A' }), t('cNone', '无锚子任务')],
    }),
  ],
};
eq(
  selectVisibleTasks(inheritPlan, new Set(['NODE_A'])).map((n) => n.id),
  ['p'],
  '父任务在筐 A 可见',
);
eq(
  selectVisibleTasks(inheritPlan, new Set(['NODE_A']))[0].children.map((n) => n.id).sort(),
  ['cA', 'cNone'],
  '父任务可见时其子任务随父一并可见（含无锚子任务）',
);
// 反例：无锚子任务若被移到根级，则任何筐都看不到它 —— 这正是「子任务必须继承筐」的原因
const orphaned = moveTask(inheritPlan, 'cNone', null, 0);
eq(
  selectVisibleTasks(orphaned, new Set(['NODE_A'])).map((n) => n.id),
  ['p'],
  '无锚子任务一旦离开父任务就不再随父可见（故创建时必须继承筐）',
);
eq(
  collectUnclassifiedTasks(orphaned).map((n) => n.id),
  ['cNone'],
  '它此时落进未归类',
);

/* ── 收件箱：全局中心（无 scope 节点）创建的任务无锚 ── */
const inboxTask = t('inbox', '收件箱任务');
assert(inboxTask.anchorNodeId === undefined, '不指定锚点时任务无锚（= 全局中心创建）');
eq(collectUnclassifiedTasks({ schemaVersion: 1, nodes: [inboxTask] }).map((n) => n.id), ['inbox'], '无锚任务进未归类');

console.log(`✓ assert-plan: ${count} 项断言全部通过`);
