import type { Env } from './env';
import type { AuthUser } from './auth';
import { deleteFile, getFile, putFile } from './github';
import { USER_FEISHU_OAUTH_PATH } from '@webbook/shared';

const FEISHU_API = 'https://open.feishu.cn/open-apis';

/**
 * 所需用户授权 scope 变更时递增；旧绑定无此版本号会被视为未绑定，强制重新授权。
 * v2: 补上 docx:document.block:convert（markdown convert 必需）
 */
export const FEISHU_OAUTH_AUTH_VERSION = 2;

/** 授权页 scope（空格分隔）；须与开放平台已开通权限一致 */
export const FEISHU_OAUTH_SCOPES = [
  'docx:document',
  'docx:document:readonly',
  'docx:document.block:convert',
  'drive:drive',
  'drive:file',
  'offline_access',
].join(' ');

export type FeishuOAuthRecord = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  /** 上次导出目录 */
  lastFolderToken?: string;
  openId?: string;
  updatedAt: string;
  /** 授权时的 scope 版本；缺省或落后则需重新 OAuth */
  authVersion?: number;
};

function feishuAppId(env: Env): string {
  return (env.FEISHU_APP_ID || '').trim();
}

function feishuAppSecret(env: Env): string {
  return (env.FEISHU_APP_SECRET || '').trim();
}

function feishuRedirectUri(env: Env): string {
  return (env.FEISHU_REDIRECT_URI || '').trim();
}

function feishuConfigured(env: Env): boolean {
  return Boolean(feishuAppId(env) && feishuAppSecret(env) && feishuRedirectUri(env));
}

export function feishuConfigError(): Response {
  return json(
    { error: 'feishu_not_configured', message: '未配置 FEISHU_APP_ID / SECRET / REDIRECT_URI' },
    503,
  );
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,DELETE,POST,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function encodeState(
  env: Env,
  data: { userId: string; returnTo: string; nonce: string },
): Promise<string> {
  const secret = feishuAppSecret(env);
  if (!secret) throw new Error('FEISHU_APP_SECRET missing');
  const body = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  const sig = await hmacSign(secret, body);
  return `${body}.${sig}`;
}

async function decodeState(
  env: Env,
  state: string,
): Promise<{ userId: string; returnTo: string; nonce: string } | null> {
  const secret = feishuAppSecret(env);
  if (!secret) return null;
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const expect = await hmacSign(secret, body);
  if (expect !== sig) return null;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(body)))) as {
      userId: string;
      returnTo: string;
      nonce: string;
    };
  } catch {
    return null;
  }
}

async function loadOAuth(env: Env, userId: string): Promise<FeishuOAuthRecord | null> {
  const raw = await getFile(env, USER_FEISHU_OAUTH_PATH(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FeishuOAuthRecord;
  } catch {
    return null;
  }
}

async function saveOAuth(env: Env, userId: string, rec: FeishuOAuthRecord): Promise<void> {
  await putFile(
    env,
    USER_FEISHU_OAUTH_PATH(userId),
    JSON.stringify(rec, null, 2),
    `chore: feishu oauth for ${userId.slice(0, 8)}`,
  );
}

type FeishuTokenResult = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  open_id?: string;
};

type FeishuTokenResponse = {
  code?: number;
  msg?: string;
  error?: string;
  error_description?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  open_id?: string;
  data?: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    open_id?: string;
  };
};

function parseTokenResponse(data: FeishuTokenResponse, label: string): FeishuTokenResult {
  const access =
    data.access_token || data.data?.access_token;
  const refresh =
    data.refresh_token || data.data?.refresh_token || '';
  const expires =
    data.expires_in ?? data.data?.expires_in ?? 7200;
  const openId = data.open_id || data.data?.open_id;
  // v2 成功多为 code===0 且根级带 access_token；部分错误无 code
  if (typeof data.code === 'number' && data.code !== 0 && !access) {
    throw new Error(
      data.msg || data.error_description || data.error || `${label} error ${data.code}`,
    );
  }
  if (!access) {
    throw new Error(
      data.msg || data.error_description || data.error || `${label}: missing access_token`,
    );
  }
  return {
    access_token: access,
    refresh_token: refresh,
    expires_in: expires,
    open_id: openId,
  };
}

/** 官方现行：POST /authen/v2/oauth/token */
async function feishuTokenRequestV2(body: Record<string, string>): Promise<FeishuTokenResult> {
  const res = await fetch(`${FEISHU_API}/authen/v2/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as FeishuTokenResponse;
  return parseTokenResponse(data, 'feishu v2 token');
}

/** 旧版兜底 */
async function feishuTokenRequestLegacy(
  path: '/authen/v1/oidc/access_token' | '/authen/v1/access_token',
  body: Record<string, string>,
): Promise<FeishuTokenResult> {
  const res = await fetch(`${FEISHU_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as FeishuTokenResponse;
  return parseTokenResponse(data, `feishu ${path}`);
}

async function exchangeCode(env: Env, code: string) {
  const body = {
    grant_type: 'authorization_code',
    client_id: feishuAppId(env),
    client_secret: feishuAppSecret(env),
    code,
    redirect_uri: feishuRedirectUri(env),
  };
  try {
    return await feishuTokenRequestV2(body);
  } catch (e1) {
    try {
      return await feishuTokenRequestLegacy('/authen/v1/oidc/access_token', body);
    } catch {
      try {
        return await feishuTokenRequestLegacy('/authen/v1/access_token', body);
      } catch (e3) {
        const a = e1 instanceof Error ? e1.message : String(e1);
        const b = e3 instanceof Error ? e3.message : String(e3);
        throw new Error(`换取 user_access_token 失败：${a}；旧接口：${b}`);
      }
    }
  }
}

async function refreshAccess(env: Env, refreshToken: string) {
  const body = {
    grant_type: 'refresh_token',
    client_id: feishuAppId(env),
    client_secret: feishuAppSecret(env),
    refresh_token: refreshToken,
  };
  try {
    return await feishuTokenRequestV2(body);
  } catch {
    return feishuTokenRequestLegacy('/authen/v1/oidc/access_token', {
      ...body,
      redirect_uri: feishuRedirectUri(env),
    });
  }
}

function oauthAuthVersionOk(rec: FeishuOAuthRecord): boolean {
  return (rec.authVersion ?? 0) >= FEISHU_OAUTH_AUTH_VERSION;
}

export async function getValidUserAccessToken(
  env: Env,
  userId: string,
): Promise<{ token: string; record: FeishuOAuthRecord } | null> {
  const rec = await loadOAuth(env, userId);
  if (!rec?.refreshToken) return null;
  // 旧授权缺 convert 等 scope：强制走重新授权，refresh 不会补上新 privilege
  if (!oauthAuthVersionOk(rec)) return null;
  if (rec.expiresAt > Date.now() + 60_000 && rec.accessToken) {
    return { token: rec.accessToken, record: rec };
  }
  const fresh = await refreshAccess(env, rec.refreshToken);
  const next: FeishuOAuthRecord = {
    ...rec,
    accessToken: fresh.access_token,
    refreshToken: fresh.refresh_token || rec.refreshToken,
    expiresAt: Date.now() + (fresh.expires_in || 7200) * 1000,
    openId: fresh.open_id || rec.openId,
    // refresh 不会增加 privilege；版本只在 OAuth callback 写入
    authVersion: rec.authVersion,
    updatedAt: new Date().toISOString(),
  };
  await saveOAuth(env, userId, next);
  return { token: next.accessToken, record: next };
}

export async function handleFeishuStatus(env: Env, user: AuthUser): Promise<Response> {
  if (!feishuConfigured(env)) return feishuConfigError();
  const stored = await loadOAuth(env, user.id);
  const needsReauth = Boolean(stored?.refreshToken && !oauthAuthVersionOk(stored));
  const bound = await getValidUserAccessToken(env, user.id);
  return json({
    configured: true,
    bound: Boolean(bound),
    needsReauth,
    authVersion: stored?.authVersion ?? 0,
    requiredAuthVersion: FEISHU_OAUTH_AUTH_VERSION,
    lastFolderToken: bound?.record.lastFolderToken ?? stored?.lastFolderToken ?? null,
  });
}

export async function handleFeishuOAuthUnbind(env: Env, user: AuthUser): Promise<Response> {
  if (!feishuConfigured(env)) return feishuConfigError();
  await deleteFile(
    env,
    USER_FEISHU_OAUTH_PATH(user.id),
    `chore: unbind feishu oauth for ${user.id.slice(0, 8)}`,
  );
  return json({ ok: true });
}

export async function handleFeishuOAuthStart(
  env: Env,
  user: AuthUser,
  returnTo: string,
): Promise<Response> {
  if (!feishuConfigured(env)) return feishuConfigError();
  const state = await encodeState(env, {
    userId: user.id,
    returnTo: returnTo || '/',
    nonce: crypto.randomUUID(),
  });
  // 授权页须用 accounts 域名 + client_id + response_type=code（旧 app_id 会报 20028）
  // scope 须含 docx:document.block:convert，否则 convert 接口会 99991679
  const url = new URL('https://accounts.feishu.cn/open-apis/authen/v1/authorize');
  url.searchParams.set('client_id', feishuAppId(env));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', feishuRedirectUri(env));
  url.searchParams.set('scope', FEISHU_OAUTH_SCOPES);
  url.searchParams.set('state', state);
  return json({ url: url.toString() });
}

export async function handleFeishuOAuthCallback(env: Env, req: Request): Promise<Response> {
  if (!feishuConfigured(env)) return feishuConfigError();
  try {
    const u = new URL(req.url);
    const code = u.searchParams.get('code');
    const state = u.searchParams.get('state');
    const err = u.searchParams.get('error');
    if (err) {
      return new Response(`飞书授权被拒绝或失败：${err}`, {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    if (!code || !state) {
      return new Response('missing code/state', { status: 400 });
    }
    const parsed = await decodeState(env, state);
    if (!parsed) {
      return new Response('invalid state（请回 WebBook 重新点「导出到飞书」授权）', {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    const tokens = await exchangeCode(env, code);
    if (!tokens.refresh_token) {
      return new Response(
        '未拿到 refresh_token。请确认应用已申请 offline_access，并在授权页勾选相关权限后重试。',
        { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
      );
    }
    const prev = await loadOAuth(env, parsed.userId);
    await saveOAuth(env, parsed.userId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in || 7200) * 1000,
      openId: tokens.open_id,
      lastFolderToken: prev?.lastFolderToken,
      authVersion: FEISHU_OAUTH_AUTH_VERSION,
      updatedAt: new Date().toISOString(),
    });
    const dest =
      parsed.returnTo && /^https?:\/\//i.test(parsed.returnTo)
        ? parsed.returnTo
        : parsed.returnTo?.startsWith('/')
          ? parsed.returnTo
          : '/app';
    // 相对路径无法 Response.redirect；拼到前端常见源需由 returnTo 带绝对 URL
    if (!/^https?:\/\//i.test(dest)) {
      return new Response(
        `飞书已绑定成功。请手动打开 WebBook 继续导出。\nreturnTo=${parsed.returnTo || '(empty)'}`,
        { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
      );
    }
    return Response.redirect(dest, 302);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`飞书 OAuth 回调失败：${msg}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function feishuFetch(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<{ code: number; msg: string; data?: Record<string, unknown> }> {
  const res = await fetch(`${FEISHU_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      ...(init.headers ?? {}),
    },
  });
  return (await res.json()) as { code: number; msg: string; data?: Record<string, unknown> };
}

export async function handleFeishuFolders(
  env: Env,
  user: AuthUser,
  parent: string | null,
): Promise<Response> {
  if (!feishuConfigured(env)) return feishuConfigError();
  const auth = await getValidUserAccessToken(env, user.id);
  if (!auth) return json({ error: 'feishu_not_bound', message: '请先授权飞书' }, 401);

  const q = new URLSearchParams({
    page_size: '50',
    folder_token: parent || '',
  });
  // 根目录可不传 folder_token
  if (!parent) q.delete('folder_token');
  const data = await feishuFetch(auth.token, `/drive/v1/files?${q}`, { method: 'GET' });
  if (data.code !== 0) {
    return json({ error: 'feishu_api', message: data.msg, code: data.code }, 502);
  }
  const files = (data.data?.files as { token: string; name: string; type: string }[]) ?? [];
  const folders = files
    .filter((f) => f.type === 'folder')
    .map((f) => ({ token: f.token, name: f.name }));
  return json({
    parent: parent || null,
    folders,
    lastFolderToken: auth.record.lastFolderToken ?? null,
  });
}

type MediaUpload = { relativePath: string; bytes: ArrayBuffer; filename: string };

async function createDocx(
  token: string,
  title: string,
  folderToken: string | null,
): Promise<string> {
  const body: Record<string, string> = { title: title.slice(0, 800) || '未命名' };
  if (folderToken) body.folder_token = folderToken;
  const data = await feishuFetch(token, '/docx/v1/documents', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (data.code !== 0) throw new Error(data.msg || 'create document failed');
  const doc = data.data?.document as { document_id?: string } | undefined;
  if (!doc?.document_id) throw new Error('no document_id');
  return doc.document_id;
}

type FeishuBlock = {
  block_id?: string;
  children?: string[];
  block_type?: number;
  parent_id?: string;
  [key: string]: unknown;
};

type ConvertResult = {
  firstLevelIds: string[];
  blocksById: Map<string, FeishuBlock>;
};

function stripMergeInfo<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (k, v) => (k === 'merge_info' ? undefined : v)),
  ) as T;
}

function indexConvertBlocks(raw: unknown): Map<string, FeishuBlock> {
  const byId = new Map<string, FeishuBlock>();
  const list: FeishuBlock[] = Array.isArray(raw)
    ? (raw as FeishuBlock[])
    : raw && typeof raw === 'object'
      ? (Object.values(raw as Record<string, FeishuBlock>) as FeishuBlock[])
      : [];
  for (const b of list) {
    if (b?.block_id) byId.set(b.block_id, b);
  }
  return byId;
}

/** 收集若干一级块及其全部子孙（供 descendant.descendants） */
function collectDescendantTree(rootIds: string[], byId: Map<string, FeishuBlock>): FeishuBlock[] {
  const out: FeishuBlock[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const b = byId.get(id);
    if (!b) return;
    out.push(b);
    const kids = Array.isArray(b.children) ? b.children : [];
    for (const c of kids) walk(c);
  };
  for (const id of rootIds) walk(id);
  return out;
}

/**
 * Markdown → 飞书块。阅读序以 first_level_block_ids 为准（勿用 blocks 数组/Object.values 顺序）。
 */
async function convertMarkdown(token: string, markdown: string): Promise<ConvertResult> {
  const data = await feishuFetch(token, '/docx/v1/documents/blocks/convert', {
    method: 'POST',
    body: JSON.stringify({ content_type: 'markdown', content: markdown }),
  });
  if (data.code !== 0) throw new Error(data.msg || 'convert failed');

  const blocksById = indexConvertBlocks(data.data?.blocks);
  let firstLevelIds = (data.data?.first_level_block_ids as string[] | undefined) ?? [];
  if (firstLevelIds.length === 0) {
    // 兜底：无 first_level 时用 parent 为空的块，仍可能乱序
    firstLevelIds = [...blocksById.values()]
      .filter((b) => b.block_id && (!b.parent_id || b.parent_id === ''))
      .map((b) => b.block_id!);
  }
  firstLevelIds = firstLevelIds.filter((id) => blocksById.has(id));
  if (firstLevelIds.length === 0) {
    throw new Error('convert 未返回可用块（first_level_block_ids 为空）');
  }
  const cleaned = new Map<string, FeishuBlock>();
  for (const [id, b] of blocksById) {
    cleaned.set(id, stripMergeInfo(b));
  }
  return { firstLevelIds, blocksById: cleaned };
}

/**
 * 按一级块顺序写入；children_id 必须是一级临时 ID 列表。
 * 分片时以一级块为边界，每次带上该批的完整子树。
 */
async function insertBlocks(
  token: string,
  documentId: string,
  converted: ConvertResult,
): Promise<unknown[]> {
  const { firstLevelIds, blocksById } = converted;
  // descendant 单次 descendants ≤ 1000；按一级块分批，控制子树规模
  const maxFirstLevelPerRequest = 40;
  const created: unknown[] = [];

  for (let i = 0; i < firstLevelIds.length; i += maxFirstLevelPerRequest) {
    const chunkIds = firstLevelIds.slice(i, i + maxFirstLevelPerRequest);
    let descendants = collectDescendantTree(chunkIds, blocksById);
    // 若单批子树过大，再按更小一级块切
    if (descendants.length > 900 && chunkIds.length > 1) {
      for (const id of chunkIds) {
        descendants = collectDescendantTree([id], blocksById);
        const part = await insertDescendantBatch(token, documentId, [id], descendants);
        created.push(...part);
      }
      continue;
    }
    const part = await insertDescendantBatch(token, documentId, chunkIds, descendants);
    created.push(...part);
  }
  return created;
}

async function insertDescendantBatch(
  token: string,
  documentId: string,
  childrenId: string[],
  descendants: FeishuBlock[],
): Promise<unknown[]> {
  if (childrenId.length === 0 || descendants.length === 0) return [];
  const data = await feishuFetch(
    token,
    `/docx/v1/documents/${documentId}/blocks/${documentId}/descendant`,
    {
      method: 'POST',
      body: JSON.stringify({
        children_id: childrenId,
        descendants,
        index: -1,
      }),
    },
  );
  if (data.code === 0) {
    return (
      (data.data?.children as unknown[]) ??
      (data.data?.blocks as unknown[]) ??
      descendants
    );
  }

  // 回退：仅插一级块（丢失嵌套，但保留 children_id 顺序）
  const topLevel = childrenId
    .map((id) => {
      const b = descendants.find((d) => d.block_id === id);
      if (!b) return null;
      const copy = { ...b, children: [] as string[] };
      return copy;
    })
    .filter(Boolean);
  const fallback = await feishuFetch(
    token,
    `/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
    {
      method: 'POST',
      body: JSON.stringify({ children: topLevel, index: -1 }),
    },
  );
  if (fallback.code !== 0) {
    throw new Error(fallback.msg || data.msg || 'insert blocks failed');
  }
  return (fallback.data?.children as unknown[]) ?? [];
}

/** 正文若以与文档标题相同的 H1 开头则去掉，避免标题栏 + 正文双标题 */
function stripLeadingTitleHeading(markdown: string, title: string): string {
  const t = title.trim();
  if (!t) return markdown;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return markdown.replace(new RegExp(`^#\\s+${escaped}\\s*\\r?\\n+`, 'u'), '');
}

async function uploadImageToBlock(
  token: string,
  documentId: string,
  blockId: string,
  bytes: ArrayBuffer,
  filename: string,
): Promise<void> {
  const size = bytes.byteLength;
  const form = new FormData();
  form.append(
    'file_name',
    filename,
  );
  form.append('parent_type', 'docx_image');
  form.append('parent_node', blockId);
  form.append('size', String(size));
  form.append('extra', JSON.stringify({ drive_route_token: documentId }));
  form.append('file', new Blob([bytes]), filename);

  const res = await fetch(`${FEISHU_API}/drive/v1/medias/upload_all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = (await res.json()) as {
    code: number;
    msg: string;
    data?: { file_token?: string };
  };
  if (data.code !== 0 || !data.data?.file_token) {
    throw new Error(data.msg || 'upload media failed');
  }
  const patch = await feishuFetch(token, `/docx/v1/documents/${documentId}/blocks/${blockId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      replace_image: { token: data.data.file_token },
    }),
  });
  if (patch.code !== 0) throw new Error(patch.msg || 'replace_image failed');
}

function collectImageBlockIds(nodes: unknown[], out: { blockId: string; hint?: string }[] = []) {
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    const o = n as Record<string, unknown>;
    const blockId = o.block_id as string | undefined;
    const blockType = o.block_type as number | undefined;
    // 27 = image
    if (blockId && blockType === 27) {
      out.push({ blockId });
    }
    if (Array.isArray(o.children)) collectImageBlockIds(o.children, out);
    // some responses nest under image
  }
  return out;
}

export async function handleFeishuExport(
  env: Env,
  user: AuthUser,
  req: Request,
): Promise<Response> {
  if (!feishuConfigured(env)) return feishuConfigError();
  const auth = await getValidUserAccessToken(env, user.id);
  if (!auth) return json({ error: 'feishu_not_bound', message: '请先授权飞书' }, 401);

  const ct = req.headers.get('content-type') || '';
  let title = '未命名笔记';
  let markdown = '';
  let folderToken: string | null = null;
  const media: MediaUpload[] = [];
  const warnings: string[] = [];

  if (ct.includes('multipart/form-data')) {
    const form = await req.formData();
    title = String(form.get('title') || title);
    markdown = String(form.get('markdown') || '');
    const ft = form.get('folder_token');
    folderToken = ft && String(ft) ? String(ft) : null;
    for (const [key, value] of form.entries()) {
      if (!(value instanceof File)) continue;
      if (key !== 'media' && !key.startsWith('media')) continue;
      const relativePath = value.name.includes('/')
        ? value.name
        : `图片和附件/${value.name}`;
      media.push({
        relativePath,
        bytes: await value.arrayBuffer(),
        filename: value.name.split('/').pop() || value.name,
      });
    }
  } else {
    const body = (await req.json()) as {
      title?: string;
      markdown?: string;
      folder_token?: string | null;
    };
    title = body.title || title;
    markdown = body.markdown || '';
    folderToken = body.folder_token ?? null;
  }

  if (!markdown.trim()) {
    return json({ error: 'empty_markdown', message: '没有可导出的内容' }, 400);
  }

  try {
    const documentId = await createDocx(auth.token, title, folderToken);
    const mdForConvert = stripLeadingTitleHeading(markdown, title);
    const converted = await convertMarkdown(auth.token, mdForConvert);
    const created = await insertBlocks(auth.token, documentId, converted);
    const imageBlocks = collectImageBlockIds(created);
    // 若 children 未回传完整树，再拉一次文档块
    if (imageBlocks.length === 0) {
      const listed = await feishuFetch(auth.token, `/docx/v1/documents/${documentId}/blocks`, {
        method: 'GET',
      });
      const items = (listed.data?.items as unknown[]) ?? [];
      collectImageBlockIds(items, imageBlocks);
    }

    // 按出现顺序把媒体填进 image 块
    const imageMedia = media.filter((m) =>
      /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(m.filename),
    );
    for (let i = 0; i < imageBlocks.length; i++) {
      const m = imageMedia[i];
      if (!m) {
        warnings.push(`图片块 ${imageBlocks[i].blockId} 无对应文件`);
        continue;
      }
      try {
        await uploadImageToBlock(
          auth.token,
          documentId,
          imageBlocks[i].blockId,
          m.bytes,
          m.filename,
        );
      } catch (e) {
        warnings.push(`上传失败 ${m.filename}: ${(e as Error).message}`);
      }
    }

    await saveOAuth(env, user.id, {
      ...auth.record,
      lastFolderToken: folderToken ?? auth.record.lastFolderToken,
      updatedAt: new Date().toISOString(),
    });

    const url = `https://feishu.cn/docx/${documentId}`;
    return json({ ok: true, documentId, url, warnings });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    const needsReauth =
      /99991679|document\.block:convert|re-authorization|未获取所需的用户授权/i.test(msg);
    return json(
      {
        error: needsReauth ? 'feishu_needs_reauth' : 'feishu_export_failed',
        message: needsReauth
          ? `${msg}（请点「重新授权飞书」后重试；开放平台须已开通 docx:document.block:convert）`
          : msg,
        needsReauth,
      },
      502,
    );
  }
}
