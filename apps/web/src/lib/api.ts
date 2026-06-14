import type { Circle, CircleShareStatus, CircleSummary, Comment, Note, NoteTree, PublicFeedItem, Reminder, RemindersIndex, BloggerSummary, AIStrategiesConfig, SystemSettings } from '@webbook/shared';
import { normalizeNote } from '@webbook/shared';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export function assetUrl(src: string): string {
  if (!src) return src;
  if (src.startsWith('data:') || src.startsWith('http')) return src;
  if (src.startsWith('/api/')) return `${BASE}${src}`;
  return src;
}

interface RequestOpts {
  token?: string;
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
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** 远端：Workers API → GitHub */
export const apiClient = {
  loadTree: (token?: string) =>
    http<NoteTree>('/api/tree', token ? { token } : {}),
  loadPublicTree: () => http<NoteTree>('/api/public/tree'),
  saveTree: (tree: NoteTree, token: string) =>
    http<{ ok: true }>('/api/tree', {
      method: 'PUT',
      token,
      body: JSON.stringify(tree),
    }),
  loadNote: async (id: string, token?: string) => {
    const raw = await http<Note>(`/api/notes/${id}`, token ? { token } : {});
    return normalizeNote(raw);
  },
  loadPublicFeed: () => http<{ posts: PublicFeedItem[] }>('/api/public/feed'),
  loadBloggers: () => http<{ bloggers: BloggerSummary[] }>('/api/public/bloggers'),
  loadUserPublicFeed: (userId: string) =>
    http<{ ownerId: string; ownerEmail: string; posts: PublicFeedItem[] }>(
      `/api/public/users/${userId}/feed`,
    ),
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
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
    return res.json() as Promise<{ url: string }>;
  },
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

  listCircles: (token: string) =>
    http<{ circles: CircleSummary[] }>('/api/circles', { token }),
  createCircle: (name: string, token: string) =>
    http<Circle>('/api/circles', {
      method: 'POST',
      token,
      body: JSON.stringify({ name }),
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
  updateCircleShare: (id: string, shareStatus: CircleShareStatus, token: string) =>
    http<Circle>(`/api/circles/${id}/share`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ shareStatus }),
    }),
  leaveCircle: (circleId: string, userId: string, token: string) =>
    http<Circle>(`/api/circles/${circleId}/members/${userId}`, {
      method: 'DELETE',
      token,
    }),

  loadReminders: (token: string) =>
    http<RemindersIndex>('/api/reminders', { token }),
  addQuickReminder: (token: string, text: string) =>
    http<Reminder>('/api/reminders', {
      method: 'POST',
      token,
      body: JSON.stringify({ text }),
    }),
  patchReminder: (token: string, id: string, patch: { done?: boolean }) =>
    http<Reminder>(`/api/reminders/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(patch),
    }),

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
};
