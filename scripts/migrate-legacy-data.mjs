/**
 * 将 legacy 单用户数据（data/tree.json + data/notes/）合并到指定用户目录。
 *
 * 用法：
 *   npm run migrate:legacy -- --user-id=<uuid> --email=<邮箱>
 *   npm run migrate:legacy -- --user-id=<uuid> --email=<邮箱> --dry-run
 *
 * 前提：.env 中配置 GITHUB_TOKEN、GITHUB_REPO、GITHUB_BRANCH
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mergeLegacyTree,
  collectTreeNoteIds,
  isTreeEmpty,
} from '../packages/shared/dist/migrateLegacy.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');

const LEGACY_TREE_PATH = 'data/tree.json';
const LEGACY_NOTE_DIR = 'data/notes';
const userTreePath = (userId) => `data/users/${userId}/tree.json`;
const userNotePath = (userId, noteId) => `data/users/${userId}/notes/${noteId}.json`;
const USERS_INDEX_PATH = 'data/meta/users-index.json';

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

function parseArgs(argv) {
  const out = { dryRun: false };
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--user-id=')) out.userId = arg.slice('--user-id='.length);
    else if (arg.startsWith('--email=')) out.email = arg.slice('--email='.length);
  }
  return out;
}

const env = loadEnv();
const token = env.GITHUB_TOKEN;
const repo = env.GITHUB_REPO;
const branch = env.GITHUB_BRANCH || 'main';
const args = parseArgs(process.argv.slice(2));

if (!token || !repo) {
  console.error('缺少 GITHUB_TOKEN 或 GITHUB_REPO');
  process.exit(1);
}
if (!args.userId || !args.email) {
  console.error('用法: npm run migrate:legacy -- --user-id=<uuid> --email=<邮箱> [--dry-run]');
  process.exit(1);
}

const API = 'https://api.github.com';
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'X-GitHub-Api-Version': '2022-11-28',
};

function b64(s) {
  return Buffer.from(s, 'utf8').toString('base64');
}

async function getFile(path) {
  const res = await fetch(`${API}/repos/${repo}/contents/${path}?ref=${branch}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  const data = await res.json();
  return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
}

async function getSha(path) {
  const res = await fetch(`${API}/repos/${repo}/contents/${path}?ref=${branch}`, { headers });
  if (!res.ok) return undefined;
  const data = await res.json();
  return data.sha;
}

async function listDir(path) {
  const res = await fetch(`${API}/repos/${repo}/contents/${path}?ref=${branch}`, { headers });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`LIST ${path}: ${res.status}`);
  const entries = await res.json();
  if (!Array.isArray(entries)) return [];
  return entries.map((e) => e.name);
}

async function putFile(path, content, message) {
  const sha = await getSha(path);
  const res = await fetch(`${API}/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message,
      content: b64(content),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`PUT ${path}: ${res.status} ${await res.text()}`);
  console.log('✓', path);
}

function parseTree(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function upsertUsersIndex(userId, email) {
  const raw = await getFile(USERS_INDEX_PATH);
  const index = raw ? JSON.parse(raw) : { schemaVersion: 1, users: [] };
  const now = new Date().toISOString();
  const existing = index.users.find((u) => u.id === userId);
  if (existing) {
    existing.email = email;
    existing.updatedAt = now;
  } else {
    index.users.push({ id: userId, email, updatedAt: now });
  }
  if (!args.dryRun) {
    await putFile(USERS_INDEX_PATH, JSON.stringify(index, null, 2), `migrate: register ${userId}`);
  } else {
    console.log('[dry-run] would update users-index');
  }
}

async function main() {
  console.log(`迁移 legacy → user ${args.userId} (${args.email})`);
  if (args.dryRun) console.log('模式: dry-run（不写 GitHub）\n');

  const legacyRaw = await getFile(LEGACY_TREE_PATH);
  const legacyTree = parseTree(legacyRaw);
  if (!legacyTree || isTreeEmpty(legacyTree)) {
    console.log('legacy tree 为空或不存在，无需迁移。');
    return;
  }

  const userRaw = await getFile(userTreePath(args.userId));
  const userTree = parseTree(userRaw) ?? { schemaVersion: 1, roots: [] };
  const before = collectTreeNoteIds(userTree.roots);
  const merged = mergeLegacyTree(userTree, legacyTree);
  const after = collectTreeNoteIds(merged.roots);
  const addedIds = [...after].filter((id) => !before.has(id));

  console.log(`用户 tree 现有笔记: ${before.size}`);
  console.log(`legacy tree 笔记: ${collectTreeNoteIds(legacyTree.roots).size}`);
  console.log(`合并后将新增: ${addedIds.length} 篇\n`);

  let copied = 0;
  let missing = 0;
  for (const noteId of addedIds) {
    const dest = userNotePath(args.userId, noteId);
    const exists = await getFile(dest);
    if (exists) {
      console.log('· 已有', noteId);
      continue;
    }
    const legacyNote = await getFile(`${LEGACY_NOTE_DIR}/${noteId}.json`);
    if (!legacyNote) {
      console.warn('⚠ legacy 无正文', noteId);
      missing++;
      continue;
    }
    if (args.dryRun) {
      console.log('[dry-run] would copy', noteId);
    } else {
      await putFile(dest, legacyNote, `migrate: copy legacy note ${noteId}`);
    }
    copied++;
  }

  const legacyFiles = await listDir(LEGACY_NOTE_DIR);
  console.log(`\nlegacy notes 目录共 ${legacyFiles.length} 个文件`);

  if (addedIds.length > 0 || isTreeEmpty(userTree)) {
    if (args.dryRun) {
      console.log('[dry-run] would write merged tree →', userTreePath(args.userId));
    } else {
      await putFile(
        userTreePath(args.userId),
        JSON.stringify(merged, null, 2),
        `migrate: merge legacy tree → ${args.userId}`,
      );
      await upsertUsersIndex(args.userId, args.email);
    }
  } else {
    console.log('tree 无需更新（无新增节点）');
  }

  console.log('\n完成');
  console.log(`  笔记复制: ${copied}`);
  console.log(`  缺正文: ${missing}`);
  console.log(`  tree 新增节点: ${addedIds.length}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
