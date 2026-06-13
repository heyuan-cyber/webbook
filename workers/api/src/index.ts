import type { Env } from './env';
import { getFile, putFile, deleteFile, fileHistory } from './github';
import { summarizeNote, extractTodos } from './ai';
import { extractBearer, verifyUserToken } from './auth';
import { filterPublicTree, syncNoteVisibility } from './tree-filter';
import type { Note, NoteTree, RemindersIndex } from '@webbook/shared';
import { normalizeNote } from '@webbook/shared';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,DELETE,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function unauthorized(): Response {
  return json({ error: 'unauthorized' }, 401);
}

const notePath = (id: string) => `data/notes/${id}.json`;
const TREE_PATH = 'data/tree.json';
const REMINDERS_PATH = 'data/meta/reminders.json';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(req.url);
    const { pathname } = url;
    const token = extractBearer(req);
    const user = await verifyUserToken(env, token);

    try {
      // ── Public read (no auth) ──
      if (pathname === '/api/public/tree' && req.method === 'GET') {
        const raw = await getFile(env, TREE_PATH);
        const tree = raw
          ? (JSON.parse(raw) as NoteTree)
          : { schemaVersion: 1, roots: [] };
        return json(filterPublicTree(tree));
      }

      const pubNote = pathname.match(/^\/api\/public\/notes\/([^/]+)$/);
      if (pubNote && req.method === 'GET') {
        const id = pubNote[1];
        const raw = await getFile(env, notePath(id));
        if (!raw) return json({ error: 'not found' }, 404);
        const note = normalizeNote(JSON.parse(raw) as Note);
        if (note.visibility !== 'public') return json({ error: 'not found' }, 404);
        return json(note);
      }

      // ── Tree (auth optional for GET; write requires auth) ──
      if (pathname === '/api/tree') {
        if (req.method === 'GET') {
          const raw = await getFile(env, TREE_PATH);
          const tree = raw
            ? (JSON.parse(raw) as NoteTree)
            : { schemaVersion: 1, roots: [] };
          if (!user) return json(filterPublicTree(tree));
          return json(tree);
        }
        if (req.method === 'PUT') {
          if (!user) return unauthorized();
          const body = await req.text();
          await putFile(env, TREE_PATH, body, 'chore: update tree');
          return json({ ok: true });
        }
      }

      // ── Notes ──
      const noteMatch = pathname.match(/^\/api\/notes\/([^/]+)(\/history)?$/);
      if (noteMatch) {
        const id = noteMatch[1];
        const isHistory = Boolean(noteMatch[2]);

        if (isHistory && req.method === 'GET') {
          if (!user) return unauthorized();
          return json({ commits: await fileHistory(env, notePath(id)) });
        }

        if (req.method === 'GET') {
          const raw = await getFile(env, notePath(id));
          if (!raw) return json({ error: 'not found' }, 404);
          const note = normalizeNote(JSON.parse(raw) as Note);
          if (!user && note.visibility !== 'public') {
            return json({ error: 'not found' }, 404);
          }
          return json(note);
        }

        if (req.method === 'PUT') {
          if (!user) return unauthorized();
          const body = await req.text();
          const note = normalizeNote(JSON.parse(body) as Note);
          await putFile(env, notePath(id), JSON.stringify(note, null, 2), `note: update ${id}`);

          // 同步 visibility 到 tree.json
          const treeRaw = await getFile(env, TREE_PATH);
          if (treeRaw) {
            const tree = JSON.parse(treeRaw) as NoteTree;
            const synced = syncNoteVisibility(tree, id, note.visibility);
            await putFile(env, TREE_PATH, JSON.stringify(synced, null, 2), 'chore: sync visibility');
          }

          await runOnSave(env, note);
          return json({ ok: true });
        }

        if (req.method === 'DELETE') {
          if (!user) return unauthorized();
          await deleteFile(env, notePath(id), `note: delete ${id}`);
          return json({ ok: true });
        }
      }

      // ── Link preview (public) ──
      if (pathname === '/api/link-preview' && req.method === 'GET') {
        const target = url.searchParams.get('url');
        if (!target) return json({ error: 'missing url' }, 400);
        return json(await fetchLinkMeta(target));
      }

      // ── AI run (auth required) ──
      if (pathname === '/api/ai/run' && req.method === 'POST') {
        if (!user) return unauthorized();
        const { action, note } = (await req.json()) as { action: string; note: Note };
        if (action === 'summarize') return json({ summary: await summarizeNote(env, note) });
        if (action === 'extract_todos') return json({ todos: await extractTodos(env, note) });
        return json({ error: 'unknown action' }, 400);
      }

      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: (err as Error).message }, 500);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const raw = await getFile(env, TREE_PATH);
    if (!raw) return;
    const reminders: RemindersIndex = { schemaVersion: 1, reminders: [] };
    await putFile(env, REMINDERS_PATH, JSON.stringify(reminders, null, 2), 'ai: nightly tidy');
  },
};

async function runOnSave(env: Env, note: Note): Promise<void> {
  try {
    const todos = await extractTodos(env, note);
    if (todos.length === 0) return;
    const raw = await getFile(env, REMINDERS_PATH);
    const index: RemindersIndex = raw
      ? (JSON.parse(raw) as RemindersIndex)
      : { schemaVersion: 1, reminders: [] };
    const filtered = index.reminders.filter((r) => r.noteId !== note.id);
    const now = new Date().toISOString();
    for (const text of todos) {
      filtered.push({ id: `${note.id}:${text}`, noteId: note.id, text, createdAt: now, done: false });
    }
    await putFile(
      env,
      REMINDERS_PATH,
      JSON.stringify({ ...index, reminders: filtered }, null, 2),
      'ai: update reminders',
    );
  } catch {
    /* 不阻塞保存 */
  }
}

async function fetchLinkMeta(target: string) {
  try {
    const res = await fetch(target, { headers: { 'User-Agent': 'webbook-bot' } });
    const html = await res.text();
    const pick = (prop: string) =>
      html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'))?.[1];
    const title =
      pick('og:title') ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? target;
    return {
      title,
      description: pick('og:description'),
      image: pick('og:image'),
      favicon: new URL(target).origin + '/favicon.ico',
    };
  } catch {
    return { title: target };
  }
}
