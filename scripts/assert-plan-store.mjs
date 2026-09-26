/**
 * 最小断言：规划 store 的写入管线、冲突恢复、级联清理与解耦。
 *
 * 用法：node scripts/assert-plan-store.mjs
 *
 * 在 Node 里直接驱动真实的 zustand store（经 Vite 的 import map 解析 `@/` 别名），
 * 只 mock 掉 fetch / localStorage / window。这样验证的是生产代码路径本身，
 * 而不是它的复刻品。
 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';

const WEB = fileURLToPath(new URL('../apps/web/', import.meta.url));

/**
 * store 依赖 Vite 注入的 `import.meta.env` 与 `@/` 别名，Node 都跑不了。
 * 用 esbuild 打包测试入口：别名、env 常量、TS 语法一次解决。
 *
 * 注意：`@webbook/shared` 必须**内联**进产物，不能标 external——
 * data: URL 模块无法解析裸标识符（ERR_UNSUPPORTED_RESOLVE_REQUEST）。
 * 因此把它 alias 到已构建的 dist。
 */
const SHARED_DIST_ENTRY = fileURLToPath(new URL('../packages/shared/dist/index.js', import.meta.url));
if (!existsSync(SHARED_DIST_ENTRY)) {
  throw new Error('请先构建共享包：npm run build --workspace packages/shared');
}

const bundled = await build({
  entryPoints: [fileURLToPath(new URL('lib/store-entry.ts', import.meta.url))],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  write: false,
  logLevel: 'silent',
  alias: { '@': `${WEB}src`, '@webbook/shared': SHARED_DIST_ENTRY },
  define: { 'import.meta.env': '{}' },
});
// outputFiles[0].contents 已经是 Uint8Array，直接交给 Buffer。
// 不要再过 TextEncoder().encode()——那会先把字节按 Latin-1 当字符串解码，
// 含中文的产物会被膨胀数倍并损坏，模块导出直接消失。
const code = bundled.outputFiles[0].contents;
const storeModule = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);

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

/* ── 浏览器环境替身 ── */
const ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: (k) => ls.delete(k),
  clear: () => ls.clear(),
};
globalThis.window = { confirm: () => true, addEventListener() {}, removeEventListener() {} };

const calls = [];
let putBehaviour = 'ok';
let planOnServer = { schemaVersion: 1, nodes: [] };
let serverSha = 'sha-1';
let nextSha = 2;

globalThis.fetch = async (input, init = {}) => {
  const href = String(input);
  const path = href.startsWith('http') ? new URL(href).pathname : href;
  const method = (init.method ?? 'GET').toUpperCase();
  calls.push({ method, path, body: init.body });

  const jsonResponse = (status, payload) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  if (path === '/api/plan' && method === 'GET') {
    return jsonResponse(200, { plan: planOnServer, baseSha: serverSha });
  }
  if (path === '/api/plan' && method === 'PUT') {
    if (putBehaviour === 'conflict-with-concurrent-write') {
      putBehaviour = 'ok';
      // 模拟另一台设备在我们的写入窗口内先写成功：服务端内容与 sha 都变了
      planOnServer = {
        schemaVersion: 1,
        nodes: [
          ...planOnServer.nodes,
          {
            id: 'other-device',
            title: '另一台设备的任务',
            done: false,
            createdAt: new Date().toISOString(),
            priority: 'none',
            children: [],
          },
        ],
      };
      serverSha = `sha-${nextSha++}`;
      return jsonResponse(409, { error: 'conflict', baseSha: serverSha });
    }
    if (putBehaviour === 'conflict-once') {
      putBehaviour = 'ok';
      serverSha = `sha-${nextSha++}`;
      return jsonResponse(409, { error: 'conflict', baseSha: serverSha });
    }
    if (putBehaviour === 'conflict-always') {
      serverSha = `sha-${nextSha++}`;
      return jsonResponse(409, { error: 'conflict', baseSha: serverSha });
    }
    const body = JSON.parse(init.body);
    planOnServer = body.plan;
    eq(body.baseSha, serverSha, 'PUT 必须带上服务端当前 baseSha');
    serverSha = `sha-${nextSha++}`;
    return jsonResponse(200, { ok: true, baseSha: serverSha });
  }
  // 笔记链路：用来证明规划操作不会碰它
  if (path.startsWith('/api/tree')) return jsonResponse(200, { ok: true });
  if (path.startsWith('/api/notes')) return jsonResponse(200, { ok: true });
  return jsonResponse(404, { error: 'unexpected ' + path });
};

/* ── store 已在上方经 esbuild 打包载入 ── */
const { usePlanStore, setPlanToken, useNotesStore } = storeModule;

const planCalls = () => calls.filter((c) => c.path === '/api/plan');
const noteCalls = () => calls.filter((c) => c.path.startsWith('/api/notes'));
const settle = () => new Promise((r) => setTimeout(r, 0));
/** 等待写链条把 N 次写入跑完 */
async function drain(times = 6) {
  for (let i = 0; i < times; i++) await settle();
}

/* ── 1. 乐观更新 ── */
setPlanToken('test-token');
await usePlanStore.getState().load();
eq(usePlanStore.getState().baseSha, 'sha-1', 'load 记录 baseSha');

usePlanStore.getState().addTask(null, { title: '第一个任务' });
// 尚未 await 写盘：本地必须已经可见
eq(usePlanStore.getState().plan.nodes.length, 1, '乐观更新立即可见');
eq(usePlanStore.getState().plan.nodes[0].title, '第一个任务', '标题写入本地');
eq(usePlanStore.getState().plan.nodes[0].priority, 'none', '新任务默认无优先级');
eq(usePlanStore.getState().plan.nodes[0].done, false, '新任务默认未完成');
await drain();
eq(planCalls().filter((c) => c.method === 'PUT').length, 1, '乐观更新后落盘一次');
eq(planOnServer.nodes.length, 1, '服务端已收到任务');

/* ── 2. 完成语义：doneAt 成对出现与清除 ── */
const firstId = usePlanStore.getState().plan.nodes[0].id;
usePlanStore.getState().toggleDone(firstId, true);
await drain();
let task = usePlanStore.getState().plan.nodes[0];
eq(task.done, true, '标记完成');
assert(typeof task.doneAt === 'string' && task.doneAt.length > 0, '完成记录 doneAt');

usePlanStore.getState().toggleDone(firstId, false);
await drain();
task = usePlanStore.getState().plan.nodes[0];
eq(task.done, false, '取消完成');
assert(task.doneAt === undefined, '取消完成必须清掉 doneAt（否则会污染统计）');

/* ── 3. 写入串行化：连续变更不得并发 PUT ── */
calls.length = 0;
usePlanStore.getState().addTask(null, { title: 'A' });
usePlanStore.getState().addTask(null, { title: 'B' });
usePlanStore.getState().addTask(null, { title: 'C' });
await drain(10);
const puts = planCalls().filter((c) => c.method === 'PUT');
eq(puts.length, 3, '三次变更三次写入');
// 串行化证据：每个 PUT 的 baseSha 都等于上一次响应给出的 sha，即没有两个请求共用同一 baseSha
const sas = puts.map((p) => JSON.parse(p.body).baseSha);
eq(new Set(sas).size, sas.length, '每个写入使用互不相同的 baseSha（写入已串行化）');

/* ── 4. 冲突恢复：重拉 + 重放，且不覆盖并发写入 ── */
calls.length = 0;
putBehaviour = 'conflict-with-concurrent-write';
usePlanStore.getState().addTask(null, { title: '冲突任务' });
await drain(12);
const conflictCalls = planCalls();
eq(conflictCalls.filter((c) => c.method === 'GET').length, 1, '冲突后重拉一次最新版');
eq(conflictCalls.filter((c) => c.method === 'PUT').length, 2, '冲突后重放一次');
eq(usePlanStore.getState().saveError, false, '一次冲突不应留下错误状态');
eq(
  usePlanStore.getState().plan.nodes.some((n) => n.title === '冲突任务'),
  true,
  '冲突恢复后本地改动仍在',
);
assert(
  planOnServer.nodes.some((n) => n.title === '冲突任务'),
  '冲突恢复后改动最终落到服务端',
);
// 关键：另一台设备在冲突窗口内写入的任务必须存活，不能被"整份本地版本"覆盖
assert(
  planOnServer.nodes.some((n) => n.title === '另一台设备的任务'),
  '并发写入方（另一台设备）的任务不能在冲突恢复中被覆盖丢失',
);
assert(
  usePlanStore.getState().plan.nodes.some((n) => n.title === '另一台设备的任务'),
  '本地重放后也应看到另一台设备的任务（已重新拉取）',
);

/* ── 5. 持续冲突：停止重放并显式报错，不无限循环 ── */
calls.length = 0;
putBehaviour = 'conflict-always';
usePlanStore.getState().addTask(null, { title: '打不通的任务' });
await drain(20);
eq(planCalls().filter((c) => c.method === 'PUT').length, 4, '持续冲突时最多尝试 4 次后停止');
eq(usePlanStore.getState().saveError, true, '持续失败置 saveError');
eq(
  usePlanStore.getState().plan.nodes.some((n) => n.title === '打不通的任务'),
  true,
  '失败时保留本地改动（不静默丢弃）',
);
putBehaviour = 'ok';
// 复位：让后续用例从干净状态开始
await usePlanStore.getState().load();

/* ── 6. 解耦：规划写入不触碰笔记链路 ── */
calls.length = 0;
const notesBefore = useNotesStore.getState();
const treeBefore = JSON.stringify(notesBefore.tree);
const repoBefore = notesBefore.repo;
const sizeBefore = usePlanStore.getState().plan.nodes.length;
usePlanStore.getState().addTask(null, { title: '不该惊动笔记' });
await drain(8);
eq(noteCalls().length, 0, '规划变更不产生任何 /api/notes 请求');
eq(calls.filter((c) => c.path === '/api/tree').length, 0, '规划变更不产生 /api/tree 请求');
eq(JSON.stringify(useNotesStore.getState().tree), treeBefore, '规划变更不改动笔记树');
assert(useNotesStore.getState().repo === repoBefore, '规划变更不改动笔记仓库实例');
assert(
  usePlanStore.getState().plan.nodes.length === sizeBefore + 1,
  '解耦用例本身确实产生了规划变更',
);

/* ── 7. 统计与进度口径 ── */
usePlanStore.getState().addTask(null, { title: '父任务' });
await drain(4);
const parentId = usePlanStore
  .getState()
  .plan.nodes.find((n) => n.title === '父任务').id;
usePlanStore.getState().addTask(parentId, { title: '子任务 1' });
await drain(4);
usePlanStore.getState().addTask(parentId, { title: '子任务 2' });
await drain(8);

const parent = usePlanStore.getState().plan.nodes.find((n) => n.id === parentId);
eq(parent.children.length, 2, '子任务挂在父任务下');
usePlanStore.getState().toggleDone(parent.children[0].id, true);
await drain(6);
const afterChildDone = usePlanStore.getState().plan.nodes.find((n) => n.id === parentId);
eq(afterChildDone.done, false, '子任务完成不自动勾父任务（design：只算进度）');
eq(
  afterChildDone.children.filter((c) => c.done).length,
  1,
  '进度反映实际完成数',
);

/* ── 8. 移动：拒绝成环，同父级排序按下标落位 ── */
usePlanStore.getState().moveTask(parentId, null, 0);
await drain(4);
const movedRoot = usePlanStore.getState().plan.nodes[0];
eq(movedRoot.id, parentId, '移到根级首位');

const planSnapshot = JSON.stringify(usePlanStore.getState().plan);
usePlanStore.getState().moveTask(parentId, movedRoot.children[0].id, 0);
await drain(2);
eq(
  JSON.stringify(usePlanStore.getState().plan),
  planSnapshot,
  '拒绝把任务移入自身后代（无操作）',
);

/* ── 9. 级联清理：删除栏目丢弃其锚定任务，不动其他任务 ── */
await usePlanStore.getState().load();
const tree = {
  schemaVersion: 1,
  roots: [
    { id: 'F1', kind: 'folder', title: '栏目', children: [{ id: 'N1', kind: 'note', title: '笔记' }] },
    { id: 'F2', kind: 'folder', title: '别的栏目' },
  ],
};
useNotesStore.setState({ tree });
usePlanStore.setState({ plan: { schemaVersion: 1, nodes: [] } });
usePlanStore.getState().addTask(null, { title: '锚在笔记上', anchorNodeId: 'N1' });
await drain(4);
usePlanStore.getState().addTask(null, { title: '锚在栏目上', anchorNodeId: 'F1' });
await drain(4);
usePlanStore.getState().addTask(null, { title: '未归类任务' });
await drain(4);
usePlanStore.getState().addTask(null, { title: '别的栏目任务', anchorNodeId: 'F2' });
await drain(6);

const f1Subtree = new Set(['F1', 'N1']);
eq(usePlanStore.getState().countAnchored(f1Subtree), 2, '统计将随栏目删除而丢弃的任务数');
usePlanStore.getState().removeAnchored(f1Subtree);
await drain(6);
const afterCleanup = usePlanStore.getState().plan.nodes.map((n) => n.title).sort();
eq(afterCleanup, ['别的栏目任务', '未归类任务'], '级联清理只删锚在被删子树上的任务');

console.log(`✓ assert-plan-store: ${count} 项断言全部通过`);
