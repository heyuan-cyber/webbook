import type { Env } from './env';

const API = 'https://api.github.com';
const MAX_WRITE_ATTEMPTS = 4;

interface ContentResponse {
  content: string;
  sha: string;
  encoding: string;
}

/** Contents API 不能并行写同一仓库：按 repo 串行化 */
const writeChains = new Map<string, Promise<void>>();

function enqueueWrite<T>(repo: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeChains.get(repo) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  writeChains.set(
    repo,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

function metaRepo(env: Env): string {
  return env.GITHUB_REPO;
}

function resolveRepo(env: Env, repo?: string): string {
  return (repo?.trim() || metaRepo(env));
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableWriteStatus(status: number): boolean {
  return status === 409 || status === 422;
}

/** 读取文件内容（不存在返回 null）；默认 meta 仓 */
export async function getFile(env: Env, path: string, repo?: string): Promise<string | null> {
  return getFileAtRef(env, path, env.GITHUB_BRANCH, repo);
}

/** 读取指定 ref 的文件内容 */
export async function getFileAtRef(
  env: Env,
  path: string,
  ref: string,
  repo?: string,
): Promise<string | null> {
  const r = resolveRepo(env, repo);
  const res = await fetch(`${API}/repos/${r}/contents/${path}?ref=${ref}`, {
    headers: headers(env),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub get ${r}:${path}@${ref}: ${res.status}`);
  const data = (await res.json()) as ContentResponse;
  return b64decode(data.content.replace(/\n/g, ''));
}

async function getSha(env: Env, path: string, repo: string): Promise<string | undefined> {
  const res = await fetch(
    `${API}/repos/${repo}/contents/${path}?ref=${env.GITHUB_BRANCH}`,
    { headers: headers(env) },
  );
  if (!res.ok) return undefined;
  const data = (await res.json()) as { sha: string };
  return data.sha;
}

async function putContentOnce(
  env: Env,
  repo: string,
  path: string,
  contentB64: string,
  message: string,
): Promise<Response> {
  const sha = await getSha(env, path, repo);
  return fetch(`${API}/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: contentB64,
      branch: env.GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
}

async function putContentWithRetry(
  env: Env,
  repo: string,
  path: string,
  contentB64: string,
  message: string,
  label: string,
): Promise<void> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const res = await putContentOnce(env, repo, path, contentB64, message);
    if (res.ok) return;
    lastStatus = res.status;
    if (!isRetryableWriteStatus(res.status) || attempt === MAX_WRITE_ATTEMPTS - 1) {
      throw new Error(`GitHub ${label} ${repo}:${path}: ${res.status}`);
    }
    await sleep(120 * (attempt + 1));
  }
  throw new Error(`GitHub ${label} ${repo}:${path}: ${lastStatus}`);
}

/** 写入 / 更新文件（自动带上已有 sha 以更新） */
export async function putFile(
  env: Env,
  path: string,
  content: string,
  message: string,
  repo?: string,
): Promise<void> {
  const r = resolveRepo(env, repo);
  await enqueueWrite(r, () => putContentWithRetry(env, r, path, b64encode(content), message, 'put'));
}

export async function deleteFile(
  env: Env,
  path: string,
  message: string,
  repo?: string,
): Promise<void> {
  const r = resolveRepo(env, repo);
  await enqueueWrite(r, async () => {
    let lastStatus = 0;
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
      const sha = await getSha(env, path, r);
      if (!sha) return;
      const res = await fetch(`${API}/repos/${r}/contents/${path}`, {
        method: 'DELETE',
        headers: { ...headers(env), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sha, branch: env.GITHUB_BRANCH }),
      });
      if (res.ok) return;
      lastStatus = res.status;
      if (!isRetryableWriteStatus(res.status) || attempt === MAX_WRITE_ATTEMPTS - 1) {
        throw new Error(`GitHub delete ${r}:${path}: ${res.status}`);
      }
      await sleep(120 * (attempt + 1));
    }
    throw new Error(`GitHub delete ${r}:${path}: ${lastStatus}`);
  });
}

interface BinaryContentResponse {
  content?: string;
  encoding?: string;
  sha?: string;
  size?: number;
  download_url?: string | null;
}

/** Contents API 对 >1MiB 文件不返回 inline content，需走 Blobs / download_url */
async function fetchBlobBytes(env: Env, repo: string, sha: string): Promise<Uint8Array> {
  const res = await fetch(`${API}/repos/${repo}/git/blobs/${sha}`, {
    headers: headers(env),
  });
  if (!res.ok) throw new Error(`GitHub get blob ${repo}:${sha}: ${res.status}`);
  const data = (await res.json()) as { content?: string; encoding?: string };
  if (data.encoding === 'base64' && data.content) {
    return b64ToBytes(data.content);
  }
  throw new Error(`GitHub blob ${sha}: unsupported encoding ${data.encoding ?? 'none'}`);
}

async function fetchDownloadUrlBytes(env: Env, url: string): Promise<Uint8Array> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'webbook-api',
      Accept: 'application/vnd.github.raw',
    },
  });
  if (!res.ok) throw new Error(`GitHub download_url: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** 读取二进制文件；兼容 Contents API 1MiB inline 限制 */
export async function getBinaryFile(
  env: Env,
  path: string,
  repo?: string,
): Promise<Uint8Array | null> {
  const r = resolveRepo(env, repo);
  const res = await fetch(`${API}/repos/${r}/contents/${path}?ref=${env.GITHUB_BRANCH}`, {
    headers: headers(env),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub get binary ${r}:${path}: ${res.status}`);
  const data = (await res.json()) as BinaryContentResponse;

  if (data.encoding === 'base64' && data.content && data.content.length > 0) {
    return b64ToBytes(data.content);
  }
  if (data.sha) {
    return fetchBlobBytes(env, r, data.sha);
  }
  if (data.download_url) {
    return fetchDownloadUrlBytes(env, data.download_url);
  }
  return null;
}

/** 写入二进制文件 */
export async function putBinaryFile(
  env: Env,
  path: string,
  bytes: Uint8Array,
  message: string,
  repo?: string,
): Promise<void> {
  const r = resolveRepo(env, repo);
  await enqueueWrite(r, () =>
    putContentWithRetry(env, r, path, bytesToB64(bytes), message, 'put binary'),
  );
}

/** 列出目录下条目名称（仅一层） */
export async function listDirectory(env: Env, path: string, repo?: string): Promise<string[]> {
  const r = resolveRepo(env, repo);
  const res = await fetch(`${API}/repos/${r}/contents/${path}?ref=${env.GITHUB_BRANCH}`, {
    headers: headers(env),
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub list ${r}:${path}: ${res.status}`);
  const entries = (await res.json()) as Array<{ name: string; type: string }>;
  if (!Array.isArray(entries)) return [];
  return entries.map((e) => e.name);
}

/** 文件提交历史（默认 meta 仓） */
export async function fileHistory(env: Env, path: string, repo?: string) {
  const r = resolveRepo(env, repo);
  const res = await fetch(
    `${API}/repos/${r}/commits?path=${encodeURIComponent(path)}&sha=${env.GITHUB_BRANCH}`,
    { headers: headers(env) },
  );
  if (!res.ok) throw new Error(`GitHub history ${r}:${path}: ${res.status}`);
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
