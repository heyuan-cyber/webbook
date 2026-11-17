/**
 * 最小断言：目录写队列（`repository.saveTree` 的串行化与合并）。
 *
 * 为什么用 esbuild 打包：`apps/web/src/store/repository.ts` 是 TS，且import了
 * IndexedDB 与 fetch 封装。这里把本机副本与 API 换成内存桩，再用 vite 已安装的
 * esbuild 打成一个能在 Node 里跑的包——断言的是真实实现，不是复制出来的伪代码。
 *
 * 用法：node scripts/assert-tree-queue.mjs
 */
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

let count = 0;
function eq(actual, expected, msg) {
  count += 1;
  assert.deepEqual(actual, expected, msg);
}

const API_STUB = `
export class ApiError extends Error {
  constructor(path, status, body) {
    super('API ' + path + ' failed: ' + status);
    this.name = 'ApiError';
    this.path = path;
    this.status = status;
    this.body = body;
  }
}
export class TreeConflictError extends ApiError {
  constructor(path, status, body) {
    super(path, status, body);
    this.name = 'TreeConflictError';
    this.rev = body && body._rev !== undefined ? body._rev : null;
  }
}
const state = { rev: 'r0', tree: { schemaVersion: 1, roots: [] }, puts: [], latency: 15 };
globalThis.__api = state;
let seq = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const apiClient = {
  async loadTree() {
    await sleep(1);
    return { tree: state.tree, rev: state.rev, revReported: true };
  },
  async saveTree(tree, baseRev) {
    state.puts.push({ baseRev, roots: tree.roots.map((n) => n.id) });
    await sleep(state.latency);
    if (baseRev !== state.rev) {
      throw new TreeConflictError('/api/tree', 409, { _rev: state.rev });
    }
    seq += 1;
    state.rev = 'r' + seq;
    state.tree = tree;
    return { ok: true, _rev: state.rev };
  },
  async loadNote() {
    return undefined;
  },
  async saveNote() {
    return { ok: true };
  },
  async deleteNote() {},
};
`;

const STORAGE_STUB = `
export const localStore = {
  async loadTree() {
    return globalThis.__localTree ?? { schemaVersion: 1, roots: [] };
  },
  async saveTree(tree) {
    globalThis.__localTree = tree;
  },
  async loadNote() {
    return undefined;
  },
  async saveNote() {},
  async deleteNote() {},
  async allNoteIds() {
    return [];
  },
};
`;

const dir = await mkdtemp(path.join(tmpdir(), 'webbook-tree-queue-'));
try {
  await writeFile(path.join(dir, 'api.mjs'), API_STUB, 'utf8');
  await writeFile(path.join(dir, 'storage.mjs'), STORAGE_STUB, 'utf8');
  const outfile = path.join(dir, 'repo.mjs');
  await build({
    entryPoints: [path.resolve('apps/web/src/store/repository.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
    alias: {
      '@/lib/storage': path.join(dir, 'storage.mjs'),
      '@/lib/api': path.join(dir, 'api.mjs'),
    },
  });

  const { makeRepository } = await import(pathToFileURL(outfile).href);
  const api = globalThis.__api;

  const tree = (...ids) => ({
    schemaVersion: 1,
    roots: ids.map((id) => ({
      id,
      kind: 'note',
      title: id,
      noteId: id,
      visibility: 'private',
    })),
  });
  const ids = (t) => t.roots.map((n) => n.id);

  const repo = makeRepository({ userId: 'u', email: 'e@x', role: 'user', token: 't' });
  await repo.loadTree();
  eq(api.rev, 'r0', '初始 revision 来自 loadTree');
  eq(repo.getTreeRev(), 'r0', '仓库持有云端 revision');

  /* ── 1. 连续三次并发保存：只发两次 PUT，第二次写的是最新树 ── */
  await Promise.all([repo.saveTree(tree('a')), repo.saveTree(tree('b')), repo.saveTree(tree('c'))]);
  eq(api.puts.length, 2, `并发写应合并为 2 次 PUT（实际 ${api.puts.length}）`);
  eq(api.puts[0].roots, ['a'], '第一次写的是第一棵树');
  eq(api.puts[1].roots, ['c'], '排队期间只保留最新一份树');
  eq(api.rev, 'r2', '两次写各自推进 revision');
  eq(repo.getTreeRev(), 'r2', '写完后的 revision 回填到仓库');
  eq(ids(globalThis.__localTree), ['c'], '本机副本总是最新树');

  /* ── 2. 每次 await 的连续保存：各发一次，且带上一轮返回的 revision ── */
  await repo.saveTree(tree('d'));
  await repo.saveTree(tree('e'));
  eq(api.puts.length, 4, '串行调用各发一次 PUT');
  eq(api.puts[3].baseRev, 'r3', '第二次用上一次返回的 revision 作 baseRev');
  eq(repo.getTreeRev(), 'r4', 'revision 连续推进');

  /* ── 3. 云端被改动：在途写冲突，排队的写随之一并交回，只尝试一次 ── */
  api.rev = 'x1';
  api.tree = tree('x');
  const putsBefore = api.puts.length;
  const settled = await Promise.allSettled([repo.saveTree(tree('f')), repo.saveTree(tree('f2'))]);
  eq(settled[0].status, 'rejected', '过期 revision 必须抛冲突');
  eq(settled[0].reason.name, 'TreeConflictError', '抛出的是 TreeConflictError');
  eq(settled[0].reason.rev, 'x1', '冲突错误带回服务端当前 revision');
  eq(settled[1].status, 'rejected', '排队中的写随冲突一起结束');
  eq(api.puts.length, putsBefore + 1, '同一次冲突只尝试一次，不重复打服务器');

  /* ── 4. 冲突待决：不再发远端写，但本地照常落盘 ── */
  const putsBlocked = api.puts.length;
  await repo.saveTree(tree('g'));
  eq(api.puts.length, putsBlocked, '冲突待决期间不得再发远端写');
  eq(ids(globalThis.__localTree), ['g'], '冲突待决期间的目录改动仍写入本机');

  /* ── 5. 用户选「覆盖云端」：用给到的 baseRev 写入，并恢复可写状态 ── */
  const rev = await repo.overwriteTree(tree('h'), 'x1');
  eq(rev, 'r5', '覆盖写返回新 revision');
  eq(api.rev, 'r5', '云端已接受覆盖');
  await repo.saveTree(tree('i'));
  eq(api.puts.at(-1).baseRev, 'r5', '覆盖后必须用新 revision 继续');
  eq(repo.getTreeRev(), 'r6', '覆盖后正常推进');

  /* ── 6. waitForTreeWrites 能等到队列排空 ── */
  const pending = [repo.saveTree(tree('j')), repo.saveTree(tree('k')), repo.saveTree(tree('l'))];
  // saveTree 先写本机副本再入队：让出一次宏任务后再等队尾
  await new Promise((r) => setTimeout(r, 0));
  await repo.waitForTreeWrites();
  eq(ids(api.tree), ['l'], '队列排空后云端是最新树');
  await Promise.all(pending);
  eq(repo.getTreeRev(), api.rev, '队列排空后本地 revision 与服务端一致');

  console.log(`✓ assert-tree-queue: ${count} 条断言通过`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
