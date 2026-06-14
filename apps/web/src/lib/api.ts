import type { Circle, CircleSummary, CircleVisibility, CircleJoinPolicy, DiscoverableCircle, Comment, Note, NoteTree, PublicFeedItem, Reminder, RemindersIndex, BloggerSummary, AIStrategiesConfig, SystemSettings } from '@webbook/shared';
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
  loadSquareFeed: () => http<{ posts: PublicFeedItem[] }>('/api/public/square'),
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
};
