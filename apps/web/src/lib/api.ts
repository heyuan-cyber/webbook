import type { Circle, CircleSummary, CircleVisibility, CircleJoinPolicy, DiscoverableCircle, Comment, Note, NoteTree, PublicFeedItem, BloggerSummary, AIStrategiesConfig, SystemSettings, AiProvidersResponse, AiGenerateRequest, AiGenerateResult, AiJobRecord } from '@webbook/shared';
import { normalizeNote, normalizePlan } from '@webbook/shared';
import type { PlanDoc } from '@webbook/shared';
import type {
  Expense,
  ExpenseCategory,
  ExpenseRules,
  ExpenseSummary,
  NotifyIndex,
  NotifyItem,
  NotifyRepeat,
  UsageDay,
} from '@webbook/shared';
import { DEFAULT_API_BASE_URL } from '@/lib/publicDefaults';

const BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  DEFAULT_API_BASE_URL;

export interface SiteConfig {
  workNoteIds?: string[];
  blogNoteIds?: string[];
  blogCategoryOrder?: string[];
}

export function assetUrl(src: string): string {
  if (!src) return src;
  if (src.startsWith('data:') || src.startsWith('http')) return src;
  if (src.startsWith('/api/')) return `${BASE}${src}`;
  return src;
}

interface RequestOpts {
  token?: string;
}

/** 带状态码与响应体的 API 错误：乐观锁冲突要靠它区分"该重拉重放"还是"该直接报错" */
export class ApiError extends Error {
  readonly path: string;
  readonly status: number;
  readonly body: unknown;

  constructor(path: string, status: number, body: unknown) {
    super(`API ${path} failed: ${status}`);
    this.name = 'ApiError';
    this.path = path;
    this.status = status;
    this.body = body;
  }
}

/** 规划写入冲突：服务端 revision 已变。`baseSha` 是服务端当前值，用于重放。 */
export class PlanConflictError extends ApiError {
  readonly baseSha: string | null;

  constructor(path: string, status: number, body: unknown) {
    super(path, status, body);
    this.name = 'PlanConflictError';
    const sha = (body as { baseSha?: unknown } | null)?.baseSha;
    this.baseSha = typeof sha === 'string' ? sha : null;
  }
}

/**
 * 目录树写入冲突：服务端 revision 已变（别的设备改过目录）。
 * `rev` 是服务端当前 revision，交给用户决定保留哪一份——**不自动重放**：
 * 重放一棵过期的树正是要修的那个故障。
 */
export class TreeConflictError extends ApiError {
  readonly rev: string | null;

  constructor(path: string, status: number, body: unknown) {
    super(path, status, body);
    this.name = 'TreeConflictError';
    const rev = (body as { _rev?: unknown } | null)?._rev;
    this.rev = typeof rev === 'string' ? rev : null;
  }
}

/** 目录树读取结果 */
export interface LoadedTree {
  tree: NoteTree;
  /** 服务端当前 revision；`null` 表示云端还没有这棵树 */
  rev: string | null;
  /** 服务端是否报告了 revision。旧版 Worker 不返回 `_rev` → false，此时不得发起远端写 */
  revReported: boolean;
}

async function http<T>(
  path: string,
  init: RequestInit & RequestOpts = {},
): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(path, res.status, body);
  }
  return res.json() as Promise<T>;
}

/** 远端：Workers API → GitHub */
export const apiClient = {
  loadTree: async (token?: string): Promise<LoadedTree> => {
    const res = await http<NoteTree & { _rev?: string | null }>(
      '/api/tree',
      token ? { token } : {},
    );
    const { _rev, ...tree } = res;
    return {
      tree: tree as NoteTree,
      rev: typeof _rev === 'string' ? _rev : null,
      revReported: _rev !== undefined,
    };
  },
  loadPublicTree: () => http<NoteTree>('/api/public/tree'),
  /**
   * 条件写入目录树：必须带上"我读到的那个 revision"。
   * 服务端 revision 已变时抛 {@link TreeConflictError}，由界面交给用户决定。
   */
  saveTree: async (tree: NoteTree, baseRev: string | null, token: string) => {
    try {
      return await http<{ ok: true; _rev: string }>('/api/tree', {
        method: 'PUT',
        token,
        body: JSON.stringify({ tree, baseRev }),
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        throw new TreeConflictError('/api/tree', e.status, e.body);
      }
      throw e;
    }
  },
  treeHistory: (token: string) =>
    http<{ versions: { sha: string; date: string; message: string }[] }>(
      '/api/tree/history',
      { token },
    ),
  treeVersion: (sha: string, token: string) =>
    http<NoteTree>(`/api/tree/versions/${encodeURIComponent(sha)}`, { token }),
  loadNote: async (id: string, token?: string) => {
    const raw = await http<Note>(`/api/notes/${id}`, token ? { token } : {});
    return normalizeNote(raw);
  },
  loadPublicFeed: () => http<{ posts: PublicFeedItem[] }>('/api/public/feed'),
  loadSquareFeed: () => http<{ posts: PublicFeedItem[] }>('/api/public/square'),
  loadBloggers: () => http<{ bloggers: BloggerSummary[] }>('/api/public/bloggers'),
  loadUserPublicFeed: (userId: string) =>
    http<{
      ownerId: string;
      ownerEmail: string;
      posts: PublicFeedItem[];
      featuredNoteId?: string;
      site?: SiteConfig | null;
    }>(`/api/public/users/${userId}/feed`),
  loadSiteConfig: (userId: string) =>
    http<{ ownerId: string; site?: SiteConfig | null }>(`/api/public/users/${userId}/site`),
  saveSiteConfig: (site: SiteConfig, token: string) =>
    http<{ ok: true; site?: SiteConfig }>('/api/profile/site', {
      method: 'PUT',
      token,
      body: JSON.stringify({ site }),
    }),
  setFeaturedNote: (noteId: string | null, token: string) =>
    http<{ ok: true; featuredNoteId?: string }>('/api/profile/featured', {
      method: 'PUT',
      token,
      body: JSON.stringify({ noteId }),
    }),
  loadPublicNote: async (ownerId: string, noteId: string) => {
    const raw = await http<Note>(`/api/public/notes/${ownerId}/${noteId}`);
    return normalizeNote(raw);
  },
  loadPublicNoteLegacy: async (noteId: string) => {
    const raw = await http<Note & { ownerId?: string }>(`/api/public/notes/${noteId}`);
    return { note: normalizeNote(raw), ownerId: raw.ownerId ?? 'legacy' };
  },
  loadComments: (ownerId: string, noteId: string) =>
    http<{ comments: Comment[] }>(`/api/public/notes/${ownerId}/${noteId}/comments`),
  postComment: (
    ownerId: string,
    noteId: string,
    payload: {
      body: string;
      author?: {
        type: 'guest';
        guestId: string;
        displayName: string;
        avatarHue?: number;
      };
      token?: string;
    },
  ) =>
    http<Comment>(`/api/public/notes/${ownerId}/${noteId}/comments`, {
      method: 'POST',
      token: payload.token,
      body: JSON.stringify({
        body: payload.body,
        author: payload.author,
      }),
    }),
  saveNote: (note: Note, token: string) =>
    http<{ ok: true }>(`/api/notes/${note.id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(note),
    }),
  deleteNote: (id: string, token: string) =>
    http<{ ok: true }>(`/api/notes/${id}`, { method: 'DELETE', token }),
  history: (id: string, token: string) =>
    http<{ commits: { sha: string; message: string; date: string }[] }>(
      `/api/notes/${id}/history`,
      { token },
    ),
  noteVersion: async (id: string, sha: string, token: string) => {
    const raw = await http<Note>(`/api/notes/${id}/versions/${sha}`, { token });
    return normalizeNote(raw);
  },
  linkPreview: (url: string) =>
    http<{ title?: string; description?: string; image?: string; favicon?: string }>(
      `/api/link-preview?url=${encodeURIComponent(url)}`,
    ),
  uploadAsset: async (file: File, token: string) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/api/assets/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      let detail = '';
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) detail = `: ${body.error}`;
      } catch {
        /* ignore */
      }
      throw new Error(`upload failed: ${res.status}${detail}`);
    }
    return res.json() as Promise<{ url: string }>;
  },
  aiProviders: (token: string) => http<AiProvidersResponse>('/api/ai/providers', { token }),
  aiGenerate: (body: AiGenerateRequest, token: string) =>
    http<AiGenerateResult>('/api/ai/generate', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    }),
  aiJob: (jobId: string, token: string) =>
    http<AiJobRecord>(`/api/ai/jobs/${encodeURIComponent(jobId)}`, {
      token,
    }),
  aiChat: (
    note: Note,
    messages: { role: 'user' | 'assistant'; content: string }[],
    token: string,
  ) =>
    http<{ reply: string; noteMarkdown?: string }>('/api/ai/chat', {
      method: 'POST',
      token,
      body: JSON.stringify({ note, messages }),
    }),
  /**
   * 流式笔记对话：逐段回调增量文本，返回累计全文。
   * 服务端帧格式 `data: {"delta"}` / `data: [DONE]` / `data: {"error"}`。
   */
  aiChatStream: async (
    note: Note,
    messages: { role: 'user' | 'assistant'; content: string }[],
    token: string,
    handlers: { onDelta: (delta: string) => void; signal?: AbortSignal },
  ): Promise<{ text: string }> => {
    const res = await fetch(`${BASE}/api/ai/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ note, messages }),
      ...(handlers.signal ? { signal: handlers.signal } : {}),
    });
    if (!res.ok || !res.body) {
      throw new Error(`API /api/ai/chat/stream failed: ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let full = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl = buf.indexOf('\n');
      while (nl >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        nl = buf.indexOf('\n');
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let parsed: { delta?: string; error?: string };
        try {
          parsed = JSON.parse(payload) as { delta?: string; error?: string };
        } catch {
          continue;
        }
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.delta) {
          full += parsed.delta;
          handlers.onDelta(parsed.delta);
        }
      }
    }
    return { text: full };
  },

  listCircles: (token: string) =>
    http<{ circles: CircleSummary[] }>('/api/circles', { token }),
  discoverCircles: (token: string) =>
    http<{ circles: DiscoverableCircle[] }>('/api/circles/discover', { token }),
  listMyJoinRequests: (token: string) =>
    http<{ requests: { circle: DiscoverableCircle; requestedAt: string }[] }>(
      '/api/circles/join-requests',
      { token },
    ),
  createCircle: (
    payload: {
      name: string;
      description?: string;
      visibility?: CircleVisibility;
      joinPolicy?: CircleJoinPolicy;
    },
    token: string,
  ) =>
    http<Circle>('/api/circles', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),
  listCircleInvites: (token: string) =>
    http<{ invites: { circle: CircleSummary; invitedAt: string }[] }>('/api/circles/invites', {
      token,
    }),
  getCircle: (id: string, token: string) =>
    http<Circle>(`/api/circles/${id}`, { token }),
  getCircleFeed: (id: string, token: string) =>
    http<{
      circle: CircleSummary;
      feed: PublicFeedItem[];
      members: Circle['members'];
    }>(`/api/circles/${id}/feed`, { token }),
  inviteToCircle: (id: string, email: string, token: string) =>
    http<Circle>(`/api/circles/${id}/invites`, {
      method: 'POST',
      token,
      body: JSON.stringify({ email }),
    }),
  acceptCircleInvite: (id: string, token: string) =>
    http<Circle>(`/api/circles/${id}/accept`, { method: 'POST', token }),
  joinCircle: (id: string, token: string) =>
    http<Circle>(`/api/circles/${id}/join`, { method: 'POST', token }),
  requestJoinCircle: (id: string, token: string) =>
    http<Circle>(`/api/circles/${id}/request`, { method: 'POST', token }),
  updateCircleSettings: (
    id: string,
    patch: {
      name?: string;
      description?: string;
      visibility?: CircleVisibility;
      joinPolicy?: CircleJoinPolicy;
    },
    token: string,
  ) =>
    http<Circle>(`/api/circles/${id}/settings`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(patch),
    }),
  approveJoinRequest: (circleId: string, userId: string, token: string) =>
    http<Circle>(`/api/circles/${circleId}/requests/${userId}/approve`, {
      method: 'POST',
      token,
    }),
  rejectJoinRequest: (circleId: string, userId: string, token: string) =>
    http<Circle>(`/api/circles/${circleId}/requests/${userId}/reject`, {
      method: 'POST',
      token,
    }),
  updateCircleCollab: (id: string, collabEdit: boolean, token: string) =>
    http<Circle>(`/api/circles/${id}/collab`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ collabEdit }),
    }),
  loadCircleTree: (id: string, token: string) =>
    http<NoteTree>(`/api/circles/${id}/tree`, { token }),
  saveCircleTree: (id: string, tree: NoteTree, token: string) =>
    http<{ ok: true }>(`/api/circles/${id}/tree`, {
      method: 'PUT',
      token,
      body: JSON.stringify(tree),
    }),
  loadCircleNote: async (circleId: string, noteId: string, token: string) => {
    const raw = await http<Note>(`/api/circles/${circleId}/notes/${noteId}`, { token });
    return normalizeNote(raw);
  },
  saveCircleNote: (circleId: string, note: Note, token: string) =>
    http<{ ok: true }>(`/api/circles/${circleId}/notes/${note.id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(note),
    }),
  deleteCircleNote: (circleId: string, noteId: string, token: string) =>
    http<{ ok: true }>(`/api/circles/${circleId}/notes/${noteId}`, {
      method: 'DELETE',
      token,
    }),
  loadCircleMemberBlogNote: async (
    circleId: string,
    ownerId: string,
    noteId: string,
    token: string,
  ) => {
    const res = await http<{
      note: Note;
      ownerId: string;
      ownerEmail: string;
      circleId: string;
    }>(`/api/circles/${circleId}/member-blog/${ownerId}/${noteId}`, { token });
    return { ...res, note: normalizeNote(res.note) };
  },
  leaveCircle: (circleId: string, userId: string, token: string) =>
    http<Circle>(`/api/circles/${circleId}/members/${userId}`, {
      method: 'DELETE',
      token,
    }),

  loadPlan: async (token: string) => {
    const res = await http<{ plan: unknown; baseSha: string | null }>('/api/plan', { token });
    return { plan: normalizePlan(res.plan), baseSha: res.baseSha };
  },
  savePlan: async (token: string, plan: PlanDoc, baseSha: string | null) => {
    try {
      return await http<{ ok: true; baseSha: string }>('/api/plan', {
        method: 'PUT',
        token,
        body: JSON.stringify({ plan, baseSha }),
      });
    } catch (e) {
      // 冲突单独成类：调用方要拿服务端 baseSha 重拉重放，其它错误直接上报
      if (e instanceof ApiError && e.status === 409) {
        throw new PlanConflictError('/api/plan', e.status, e.body);
      }
      throw e;
    }
  },

  adminUsers: (token: string) =>
    http<{ users: { id: string; email: string; updatedAt: string; disabled?: boolean }[] }>(
      '/api/admin/users',
      { token },
    ),
  adminSetUserDisabled: (token: string, userId: string, disabled: boolean) =>
    http<{ id: string; email: string; disabled?: boolean }>(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ disabled }),
    }),
  adminLoadSettings: (token: string) =>
    http<SystemSettings>('/api/admin/settings', { token }),
  adminSaveSettings: (token: string, settings: SystemSettings) =>
    http<{ ok: true }>('/api/admin/settings', {
      method: 'PUT',
      token,
      body: JSON.stringify(settings),
    }),
  adminLoadAiStrategies: (token: string) =>
    http<AIStrategiesConfig>('/api/admin/ai-strategies', { token }),
  adminSaveAiStrategies: (token: string, config: AIStrategiesConfig) =>
    http<{ ok: true }>('/api/admin/ai-strategies', {
      method: 'PUT',
      token,
      body: JSON.stringify(config),
    }),
  adminPublicNotes: (token: string) =>
    http<{ posts: PublicFeedItem[] }>('/api/admin/public-notes', { token }),
  adminSetNoteVisibility: (
    token: string,
    ownerId: string,
    noteId: string,
    visibility: 'private' | 'public' | 'circle',
  ) =>
    http<{ ok: true }>(`/api/admin/notes/${ownerId}/${noteId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ visibility }),
    }),
  adminDeleteNote: (token: string, ownerId: string, noteId: string) =>
    http<{ ok: true }>(`/api/admin/notes/${ownerId}/${noteId}`, {
      method: 'DELETE',
      token,
    }),

  feishuStatus: (token: string) =>
    http<{
      configured: boolean;
      bound: boolean;
      needsReauth?: boolean;
      lastFolderToken: string | null;
    }>('/api/feishu/status', { token }),
  feishuOAuthStart: (token: string, returnTo: string) =>
    http<{ url: string }>(
      `/api/feishu/oauth/start?return_to=${encodeURIComponent(returnTo)}`,
      { token },
    ),
  feishuOAuthUnbind: (token: string) =>
    http<{ ok: true }>('/api/feishu/oauth', { method: 'DELETE', token }),
  feishuFolders: (token: string, parent?: string | null) =>
    http<{
      parent: string | null;
      folders: { token: string; name: string }[];
      lastFolderToken: string | null;
    }>(
      `/api/feishu/folders${parent ? `?parent=${encodeURIComponent(parent)}` : ''}`,
      { token },
    ),
  feishuExport: async (
    token: string,
    payload: {
      title: string;
      markdown: string;
      folder_token: string | null;
      files: { relativePath: string; file: File }[];
    },
  ) => {
    const form = new FormData();
    form.append('title', payload.title);
    form.append('markdown', payload.markdown);
    if (payload.folder_token) form.append('folder_token', payload.folder_token);
    for (const f of payload.files) {
      form.append('media', f.file, f.relativePath);
    }
    const res = await fetch(`${BASE}/api/feishu/export`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = (await res.json()) as {
      ok?: boolean;
      url?: string;
      documentId?: string;
      warnings?: string[];
      error?: string;
      message?: string;
      needsReauth?: boolean;
    };
    if (!res.ok) {
      const err = new Error(data.message || data.error || `export failed: ${res.status}`) as Error & {
        needsReauth?: boolean;
      };
      err.needsReauth = Boolean(data.needsReauth || data.error === 'feishu_needs_reauth');
      throw err;
    }
    return data;
  },

  /* ══════════ 手机采集数据（native-android-companion）══════════
   *
   * 三条数据线共用同一套契约：服务端归属只取 JWT 的 user.id，
   * 因此这些方法都必须带 token。
   */

  // ── 使用统计 ──
  syncUsage: (token: string, days: unknown[]) =>
    http<{ ok: true; written: string[] }>('/api/tracking/usage/sync', {
      method: 'POST',
      token,
      body: JSON.stringify({ days }),
    }),
  loadUsageDay: (token: string, date: string) =>
    http<{ date: string; day: UsageDay | null }>(
      `/api/tracking/usage?date=${encodeURIComponent(date)}`,
      { token },
    ),
  loadUsageRange: (token: string, from: string, to: string) =>
    http<{ days: UsageDay[] }>(
      `/api/tracking/usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { token },
    ),
  loadUsageDates: (token: string) =>
    http<{ dates: string[] }>('/api/tracking/usage/dates', { token }),
  deleteUsageRange: (token: string, from: string, to: string) =>
    http<{ ok: true; deleted: number }>(
      `/api/tracking/usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { method: 'DELETE', token },
    ),

  // ── 消费记账 ──
  submitExpenses: (token: string, expenses: unknown[]) =>
    http<{
      added: number;
      merged: number;
      rejected: number;
      months: string[];
      /** 归类统计：规则命中 / 模型推断 / 归入未分类 */
      classifiedByRule: number;
      classifiedByAi: number;
      unclassified: number;
    }>('/api/tracking/expenses/bulk', {
      method: 'POST',
      token,
      body: JSON.stringify({ expenses }),
    }),
  loadExpenseOverview: (token: string, month: string) =>
    http<{
      month: string;
      summary: ExpenseSummary;
      expenses: Expense[];
      rules: ExpenseRules;
    }>(`/api/tracking/expenses?month=${encodeURIComponent(month)}`, { token }),
  setExpenseCategory: (token: string, id: string, category: ExpenseCategory) =>
    http<Expense>(`/api/tracking/expenses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ category }),
    }),
  deleteExpense: (token: string, id: string) =>
    http<{ ok: true; removed: Expense }>(
      `/api/tracking/expenses/${encodeURIComponent(id)}`,
      { method: 'DELETE', token },
    ),

  // ── 到点提醒（读写 notify.json，与 reminders.json 无关）──
  loadNotify: (token: string) => http<NotifyIndex>('/api/notify', { token }),
  createNotify: (
    token: string,
    input: { title: string; body?: string; dueAt?: string; repeat?: NotifyRepeat },
  ) =>
    http<NotifyItem>('/api/notify', {
      method: 'POST',
      token,
      body: JSON.stringify(input),
    }),
  patchNotify: (
    token: string,
    id: string,
    patch: {
      title?: string;
      body?: string;
      dueAt?: string | null;
      repeat?: NotifyRepeat;
      done?: boolean;
    },
  ) =>
    http<NotifyItem>(`/api/notify/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(patch),
    }),
  deleteNotify: (token: string, id: string) =>
    http<{ ok: true }>(`/api/notify/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      token,
    }),
  /** 手机拉取窗口内的待触发实例；missed 用于呈现"错过"但不补发通知 */
  loadNotifyDue: (token: string, windowDays?: number) =>
    http<{
      due: { id: string; dueAt: string; title: string; body: string }[];
      missed: { id: string; dueAt: string; title: string; body: string }[];
      window: { from: string; to: string; generatedAt: string };
    }>(
      `/api/notify/due${windowDays ? `?windowDays=${windowDays}` : ''}`,
      { token },
    ),
  /** 送达回写：只有这个端点能写 notifiedAt，客户端无法在通用 PATCH 里伪造 */
  markNotifyDelivered: (token: string, id: string, at?: string) =>
    http<NotifyItem>(`/api/notify/${encodeURIComponent(id)}/delivered`, {
      method: 'POST',
      token,
      body: JSON.stringify(at ? { at } : {}),
    }),
};
