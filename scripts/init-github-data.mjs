/**
 * 初始化 GitHub 私有数据仓库的目录结构。
 * 用法：node scripts/init-github-data.mjs
 * 前提：已在 GitHub 网页创建私有仓库 heyuan-cyber/webbook-data
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

const env = loadEnv();
const token = env.GITHUB_TOKEN;
const repo = env.GITHUB_REPO;
const branch = env.GITHUB_BRANCH || 'main';

if (!token || !repo) {
  console.error('缺少 GITHUB_TOKEN 或 GITHUB_REPO，请检查 .env');
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

async function getSha(path) {
  const res = await fetch(`${API}/repos/${repo}/contents/${path}?ref=${branch}`, { headers });
  if (!res.ok) return undefined;
  const data = await res.json();
  return data.sha;
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
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PUT ${path} failed: ${res.status} ${err}`);
  }
  console.log('✓', path);
}

const tree = JSON.stringify({ schemaVersion: 1, roots: [] }, null, 2);
const reminders = JSON.stringify({ schemaVersion: 1, reminders: [] }, null, 2);
const strategies = JSON.stringify({ schemaVersion: 1, strategies: [] }, null, 2);
const readme = `# WebBook Data Store\n\n私有笔记数据仓库。由 Workers API 读写。\n`;

try {
  console.log(`初始化 ${repo} ...`);
  await putFile('README.md', readme, 'chore: init data store');
  await putFile('data/tree.json', tree, 'chore: init tree');
  await putFile('data/meta/reminders.json', reminders, 'chore: init reminders');
  await putFile('data/meta/ai-strategies.json', strategies, 'chore: init ai strategies');
  console.log('完成！');
} catch (e) {
  console.error(e.message);
  console.error('\n若 404：请先在 GitHub 网页创建私有仓库：');
  console.error(`  https://github.com/new  → 名称 webbook-data → Private → Create`);
  process.exit(1);
}
