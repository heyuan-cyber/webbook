import type { Env } from './env';

const API = 'https://api.github.com';

interface ContentResponse {
  content: string;
  sha: string;
  encoding: string;
}

function headers(env: Env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'webbook-api',
  };
}

function b64encode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decode(str: string): string {
  return decodeURIComponent(escape(atob(str)));
}

/** 读取文件内容（不存在返回 null） */
export async function getFile(env: Env, path: string): Promise<string | null> {
  const res = await fetch(
    `${API}/repos/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`,
    { headers: headers(env) },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub get ${path}: ${res.status}`);
  const data = (await res.json()) as ContentResponse;
  return b64decode(data.content.replace(/\n/g, ''));
}

async function getSha(env: Env, path: string): Promise<string | undefined> {
  const res = await fetch(
    `${API}/repos/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`,
    { headers: headers(env) },
  );
  if (!res.ok) return undefined;
  const data = (await res.json()) as { sha: string };
  return data.sha;
}

/** 写入 / 更新文件（自动带上已有 sha 以更新） */
export async function putFile(
  env: Env,
  path: string,
  content: string,
  message: string,
): Promise<void> {
  const sha = await getSha(env, path);
  const res = await fetch(`${API}/repos/${env.GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: b64encode(content),
      branch: env.GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`GitHub put ${path}: ${res.status}`);
}

export async function deleteFile(env: Env, path: string, message: string): Promise<void> {
  const sha = await getSha(env, path);
  if (!sha) return;
  const res = await fetch(`${API}/repos/${env.GITHUB_REPO}/contents/${path}`, {
    method: 'DELETE',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: env.GITHUB_BRANCH }),
  });
  if (!res.ok) throw new Error(`GitHub delete ${path}: ${res.status}`);
}

/** 文件提交历史 */
export async function fileHistory(env: Env, path: string) {
  const res = await fetch(
    `${API}/repos/${env.GITHUB_REPO}/commits?path=${encodeURIComponent(path)}&sha=${env.GITHUB_BRANCH}`,
    { headers: headers(env) },
  );
  if (!res.ok) throw new Error(`GitHub history ${path}: ${res.status}`);
  const commits = (await res.json()) as Array<{
    sha: string;
    commit: { message: string; author: { date: string } };
  }>;
  return commits.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    date: c.commit.author.date,
  }));
}
