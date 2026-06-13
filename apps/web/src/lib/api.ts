import type { Note, NoteTree } from '@webbook/shared';
import { normalizeNote } from '@webbook/shared';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

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
  loadPublicNote: async (id: string) => {
    const raw = await http<Note>(`/api/public/notes/${id}`);
    return normalizeNote(raw);
  },
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
  linkPreview: (url: string) =>
    http<{ title?: string; description?: string; image?: string; favicon?: string }>(
      `/api/link-preview?url=${encodeURIComponent(url)}`,
    ),
};
