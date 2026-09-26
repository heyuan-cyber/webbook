/**
 * 目录树体检（**只读**）：比对"目录树引用的笔记"与"磁盘上真实存在的笔记文件"。
 *
 * 用法：
 *   npm run audit:tree
 *   npm run audit:tree -- --user-id=<uuid>
 *   npm run audit:tree -- --ref=<sha>     # 体检某个历史版本的目录树
 *
 * 前提：.env 中配置 GITHUB_TOKEN、GITHUB_REPO、GITHUB_BRANCH
 *
 * 存在意义：2026-09-26 的整树覆盖事故之后才发现，数据仓里早就积累了三十多篇
 * "文件在、树里没有"的孤儿笔记——此前没有任何机制会主动报告这种不一致。
 * 本脚本只发 GET，不修改任何数据。
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');

function loadEnv() {
  const text = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) env[t.slice(0, i)] = t.slice(i + 1);
  }
  return env;
}

/** scripts/ 允许用当前 shell 的 GITHUB_TOKEN 覆盖 .env（.env 里的可能已过期） */
function resolveToken(env) {
  const fromShell = process.env.GITHUB_TOKEN?.trim();
  return fromShell || env.GITHUB_TOKEN?.trim() || '';
}

function parseArgs(argv) {
  const out = { ref: null, userId: null };
  for (const arg of argv) {
    if (arg.startsWith('--ref=')) out.ref = arg.slice('--ref='.length);
    else if (arg.startsWith('--user-id=')) out.userId = arg.slice('--user-id='.length);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const env = loadEnv();
const token = resolveToken(env);
const repo = env.GITHUB_REPO;
const branch = env.GITHUB_BRANCH || 'main';

if (!token) {
  console.error('✗ 缺少 GITHUB_TOKEN（.env 或环境变量）');
  process.exit(1);
}
if (!repo) {
  console.error('✗ 缺少 GITHUB_REPO（.env）');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'User-Agent': 'webbook-audit-tree',
  Accept: 'application/vnd.github+json',
};

async function gh(path) {
  const res = await fetch(`https://api.github.com/repos/${repo}/${path}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${path}: ${res.status}`);
  return res.json();
}

async function readJson(filePath, ref) {
  const entry = await gh(`contents/${filePath}${ref ? `?ref=${ref}` : ''}`);
  if (!entry?.content) return null;
  return JSON.parse(Buffer.from(entry.content, 'base64').toString('utf8'));
}

async function listNames(dirPath) {
  const entries = await gh(`contents/${dirPath}?ref=${branch}`);
  if (!Array.isArray(entries)) return [];
  return entries.map((e) => e.name);
}

function collectTreeIds(tree) {
  const ids = [];
  const noteIds = [];
  const duplicates = [];
  const seen = new Set();
  (function walk(nodes) {
    for (const n of nodes ?? []) {
      if (seen.has(n.id)) duplicates.push(n.id);
      else seen.add(n.id);
      ids.push(n.id);
      if (n.kind === 'note' && n.noteId) noteIds.push(n.noteId);
      if (n.children) walk(n.children);
    }
  })(tree.roots);
  return { ids, noteIds, duplicates };
}

async function auditUser(userId) {
  const treePath = `data/users/${userId}/tree.json`;
  const tree = await readJson(treePath, args.ref);
  if (!tree) {
    console.log(`\n── ${userId}: 没有目录树${args.ref ? `（ref=${args.ref}）` : ''}`);
    return { orphans: 0, dangling: 0, duplicates: 0 };
  }

  const { noteIds, duplicates } = collectTreeIds(tree);
  const refs = new Set(noteIds);
  const files = (await listNames(`data/users/${userId}/notes`))
    .filter((n) => n.endsWith('.json'))
    .map((n) => n.replace(/\.json$/, ''));

  const orphans = files.filter((id) => !refs.has(id));
  const dangling = noteIds.filter((id) => !files.includes(id));

  console.log(`\n── ${userId}`);
  console.log(`   树引用笔记 ${refs.size} 篇 · 磁盘笔记文件 ${files.length} 篇`);
  console.log(`   孤儿（文件在、树里没有）      : ${orphans.length}`);
  console.log(`   悬空（树引用了、文件不存在）  : ${dangling.length}`);
  console.log(`   重复节点 id                   : ${duplicates.length}`);

  if (orphans.length) {
    console.log('   孤儿笔记：');
    for (const id of orphans.slice(0, 40)) console.log(`     - ${id}`);
    if (orphans.length > 40) console.log(`     … 另有 ${orphans.length - 40} 篇`);
  }
  if (dangling.length) {
    console.log('   悬空引用：');
    for (const id of dangling.slice(0, 20)) console.log(`     - ${id}`);
  }
  if (duplicates.length) {
    console.log('   重复 id：');
    for (const id of [...new Set(duplicates)]) console.log(`     - ${id}`);
  }

  return {
    orphans: orphans.length,
    dangling: dangling.length,
    duplicates: duplicates.length,
  };
}

async function main() {
  console.log(`目录树体检  repo=${repo}  branch=${branch}${args.ref ? `  ref=${args.ref}` : ''}`);
  console.log('（只读：仅发 GET 请求）');

  let userIds;
  if (args.userId) {
    userIds = [args.userId];
  } else {
    const entries = await gh(`contents/data/users?ref=${branch}`);
    userIds = Array.isArray(entries) ? entries.map((e) => e.name) : [];
  }

  const totals = { orphans: 0, dangling: 0, duplicates: 0 };
  for (const userId of userIds) {
    const r = await auditUser(userId);
    totals.orphans += r.orphans;
    totals.dangling += r.dangling;
    totals.duplicates += r.duplicates;
  }

  console.log('\n════════ 汇总 ════════');
  console.log(`用户数            : ${userIds.length}`);
  console.log(`孤儿笔记合计      : ${totals.orphans}`);
  console.log(`悬空引用合计      : ${totals.dangling}`);
  console.log(`重复节点 id 合计  : ${totals.duplicates}`);
  console.log('\n提示：孤儿不代表数据损坏——笔记文件是完整的，只是目录树不再引用它。');
  console.log('      恢复方式：在「目录历史」里回滚，或把笔记重新挂回目录。');
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
