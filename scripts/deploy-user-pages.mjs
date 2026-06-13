#!/usr/bin/env node
/**
 * 将 user-pages/ 部署到 heyuan-cyber/heyuan-cyber.github.io 用户主页仓。
 * 需要 GITHUB_TOKEN（repo 权限）或 git remote 中的 PAT。
 */
import { spawnSync, execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const userPagesDir = resolve(root, 'user-pages');
const webAssetlinks = resolve(root, 'apps/web/public/.well-known/assetlinks.json');
const owner = 'heyuan-cyber';
const repo = 'heyuan-cyber.github.io';

function getToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const url = execSync('git remote get-url origin', { cwd: root, encoding: 'utf8' }).trim();
    const m = url.match(/x-access-token:([^@]+)@/);
    if (m) return m[1];
  } catch {
    /* ignore */
  }
  return null;
}

function api(method, path, body, token) {
  const r = spawnSync(
    'curl',
    [
      '-sS',
      '-X',
      method,
      '-H',
      `Authorization: Bearer ${token}`,
      '-H',
      'Accept: application/vnd.github+json',
      '-H',
      'X-GitHub-Api-Version: 2022-11-28',
      ...(body ? ['-d', JSON.stringify(body)] : []),
      `https://api.github.com${path}`,
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(r.stderr || 'curl failed');
  return r.stdout ? JSON.parse(r.stdout) : null;
}

const token = getToken();
if (!token) {
  console.error('需要 GITHUB_TOKEN 或带 PAT 的 git remote');
  process.exit(1);
}

// 同步最新 assetlinks
mkdirSync(resolve(userPagesDir, '.well-known'), { recursive: true });
cpSync(webAssetlinks, resolve(userPagesDir, '.well-known/assetlinks.json'));

// 确保仓库存在
let repoInfo;
try {
  repoInfo = api('GET', `/repos/${owner}/${repo}`, null, token);
} catch {
  repoInfo = null;
}
if (!repoInfo?.full_name) {
  console.log(`创建仓库 ${owner}/${repo}…`);
  const created = api(
    'POST',
    '/user/repos',
    {
      name: repo,
      description: 'WebBook TWA Digital Asset Links (user pages)',
      private: false,
      auto_init: false,
    },
    token,
  );
  if (created.message && !created.full_name) {
    console.error('创建仓库失败:', created.message);
    process.exit(1);
  }
  console.log('✓ 仓库已创建');
}

const tmp = mkdtempSync(join(tmpdir(), 'user-pages-'));
const cloneUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;

let cloned = spawnSync('git', ['clone', cloneUrl, tmp], { encoding: 'utf8' });
if (cloned.status !== 0) {
  mkdirSync(tmp, { recursive: true });
  spawnSync('git', ['init'], { cwd: tmp, stdio: 'inherit' });
  spawnSync('git', ['remote', 'add', 'origin', cloneUrl], { cwd: tmp, stdio: 'inherit' });
  spawnSync('git', ['branch', '-M', 'main'], { cwd: tmp, stdio: 'inherit' });
}

function currentBranch() {
  const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: tmp, encoding: 'utf8' });
  return r.stdout?.trim() || 'main';
}

const branch = currentBranch();

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const name of ['.well-known', 'index.html', 'README.md']) {
    const s = resolve(src, name);
    if (!existsSync(s)) continue;
    cpSync(s, resolve(dest, name), { recursive: true });
  }
}

copyDir(userPagesDir, tmp);
writeFileSync(resolve(tmp, '.nojekyll'), '');

const run = (args) =>
  spawnSync('git', args, { cwd: tmp, stdio: 'inherit', shell: false });

run(['add', '-A']);
const status = spawnSync('git', ['status', '--porcelain'], { cwd: tmp, encoding: 'utf8' });
if (status.stdout.trim()) {
  run(['config', 'user.email', 'webbook-deploy@users.noreply.github.com']);
  run(['config', 'user.name', 'WebBook Deploy']);
  run(['commit', '-m', 'Deploy TWA root assetlinks for WebBook']);
  const push = run(['push', '-u', 'origin', branch]);
  if (push.status !== 0) {
    rmSync(tmp, { recursive: true, force: true });
    console.error('推送失败。若仓库刚创建，请在 GitHub Settings → Pages 启用分支部署。');
    process.exit(push.status ?? 1);
  }
} else {
  console.log('用户主页仓无变更，跳过推送');
}
rmSync(tmp, { recursive: true, force: true });

function enablePages() {
  for (const method of ['POST', 'PUT']) {
    const res = spawnSync(
      'curl',
      [
        '-sS',
        '-X',
        method,
        '-H',
        `Authorization: Bearer ${token}`,
        '-H',
        'Accept: application/vnd.github+json',
        '-H',
        'X-GitHub-Api-Version: 2022-11-28',
        '-d',
        JSON.stringify({ build_type: 'legacy', source: { branch: 'master', path: '/' } }),
        `https://api.github.com/repos/${owner}/${repo}/pages`,
      ],
      { encoding: 'utf8' },
    );
    if (res.status === 0 && res.stdout && !res.stdout.includes('"message"')) {
      console.log('✓ 已启用 GitHub Pages（分支 master）');
      return;
    }
    const alt = spawnSync(
      'curl',
      [
        '-sS',
        '-X',
        method,
        '-H',
        `Authorization: Bearer ${token}`,
        '-H',
        'Accept: application/vnd.github+json',
        '-H',
        'X-GitHub-Api-Version: 2022-11-28',
        '-d',
        JSON.stringify({ build_type: 'legacy', source: { branch: 'main', path: '/' } }),
        `https://api.github.com/repos/${owner}/${repo}/pages`,
      ],
      { encoding: 'utf8' },
    );
    if (alt.status === 0 && alt.stdout && !alt.stdout.includes('"message"')) {
      console.log('✓ 已启用 GitHub Pages（分支 main）');
      return;
    }
  }
  console.log('⚠ 若 assetlinks 仍 404，请在 GitHub Settings → Pages 手动启用 master/main 分支');
}

enablePages();

console.log(`\n✓ 已部署到 https://github.com/${owner}/${repo}`);
console.log('  验证: https://heyuan-cyber.github.io/.well-known/assetlinks.json');
console.log('  若仍 404，请在仓库 Settings → Pages → Source 选 Deploy from branch → main → / (root)');
