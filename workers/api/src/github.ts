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

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64.replace(/\n/g, ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** 读取文件内容（不存在返回 null） */
export async function getFile(env: Env, path: string): Promise<string | null> {
  return getFileAtRef(env, path, env.GITHUB_BRANCH);
}

/** 读取指定 ref 的文件内容 */
export async function getFileAtRef(env: Env, path: string, ref: string): Promise<string | null> {
  const res = await fetch(
    `${API}/repos/${env.GITHUB_REPO}/contents/${path}?ref=${ref}`,
    { headers: headers(env) },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub get ${path}@${ref}: ${res.status}`);
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

/** 读取二进制文件（图片等） */
export async function getBinaryFile(env: Env, path: string): Promise<Uint8Array | null> {
  const res = await fetch(
    `${API}/repos/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`,
    { headers: headers(env) },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub get binary ${path}: ${res.status}`);
  const data = (await res.json()) as ContentResponse;
  return b64ToBytes(data.content);
}

/** 写入二进制文件 */
export async function putBinaryFile(
  env: Env,
  path: string,
  bytes: Uint8Array,
  message: string,
): Promise<void> {
  const sha = await getSha(env, path);
  const res = await fetch(`${API}/repos/${env.GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: bytesToB64(bytes),
      branch: env.GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`GitHub put binary ${path}: ${res.status}`);
}

/** 列出目录下条目名称（仅一层） */
export async function listDirectory(env: Env, path: string): Promise<string[]> {
  const res = await fetch(
    `${API}/repos/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`,
    { headers: headers(env) },
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub list ${path}: ${res.status}`);
  const entries = (await res.json()) as Array<{ name: string; type: string }>;
  if (!Array.isArray(entries)) return [];
  return entries.map((e) => e.name);
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
