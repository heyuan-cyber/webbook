import type { Env } from './env';
import { getBinaryFile, putBinaryFile } from './github';
import { summarizeNote, extractTodos, assistNoteChat } from './ai';
import { extractBearer, verifyUserToken } from './auth';
import { syncNoteVisibility } from './tree-filter';
import { loadComments, addComment, buildUserAuthor, buildGuestAuthor } from './comments';
import type { Note, NoteTree, NoteVisibility } from '@webbook/shared';
import { normalizeNote } from '@webbook/shared';
import type { AIStrategiesConfig, SystemSettings } from '@webbook/shared';
import {
  loadUserTree,
  saveUserTree,
  loadUserNote,
  saveUserNote,
  deleteUserNote,
  loadUserNoteAtSha,
  userNoteHistory,
  findNoteOwner,
} from './userData';
import {
  loadCircleTree,
  saveCircleTree,
  loadCircleNote,
  saveCircleNote,
  deleteCircleNote,
} from './circleData';
import {
  buildGlobalPublicFeed,
  buildUserPublicFeed,
  buildBloggersDirectory,
  buildSquareFeed,
} from './publicFeed';
import { listKnownUserIds, isUserDisabled } from './usersRegistry';
import {
  listMyCircles,
  createCircle,
  inviteToCircle,
  listPendingInvites,
  acceptInvite,
  getCircleFeed,
  getCircleDetail,
  removeMember,
  updateMyCollabEdit,
  getCircleMemberBlogNote,
  assertCircleEditor,
  assertCircleMember,
  listDiscoverableCircles,
  listMyJoinRequests,
  joinPublicCircle,
  requestJoinCircle,
  approveJoinRequest,
  rejectJoinRequest,
  updateCircleSettings,
} from './circles';
import {
  loadUserReminders,
  addQuickReminder,
  patchReminder,
  mergeTodosFromNote,
  migrateLegacyReminders,
} from './reminders';
import { migrateLegacyToUser } from './migrateLegacy';
import { runCronStrategies } from './aiStrategies';
import {
  requireAdmin,
  listAdminUsers,
  updateAdminUser,
  loadSystemSettings,
  saveSystemSettings,
  getAdminAiStrategies,
  putAdminAiStrategies,
} from './admin';
import {
  adminListPublicNotes,
  adminSetNoteVisibility,
  adminDeleteNote,
} from './adminContent';

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

function unauthorized(): Response {
  return json({ error: 'unauthorized' }, 401);
}

function forbidden(): Response {
  return json({ error: 'forbidden' }, 403);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(req.url);
    const { pathname } = url;
    const token = extractBearer(req);
    const user = await verifyUserToken(env, token);
    if (user && (await isUserDisabled(env, user.id))) return forbidden();

    try {
      // ── Public bloggers directory ──
      if (pathname === '/api/public/bloggers' && req.method === 'GET') {
        return json({ bloggers: await buildBloggersDirectory(env) });
      }

      const userFeedMatch = pathname.match(/^\/api\/public\/users\/([^/]+)\/feed$/);
      if (userFeedMatch && req.method === 'GET') {
        const ownerId = userFeedMatch[1]!;
        const posts = await buildUserPublicFeed(env, ownerId);
        const email = posts[0]?.ownerEmail ?? ownerId;
        return json({ ownerId, ownerEmail: email, posts });
      }

      // ── Public feed (/blog 全网，保留兼容) ──
      if (pathname === '/api/public/feed' && req.method === 'GET') {
        return json({ posts: await buildGlobalPublicFeed(env) });
      }

      if (pathname === '/api/public/square' && req.method === 'GET') {
        return json({ posts: await buildSquareFeed(env) });
      }

      if (pathname === '/api/public/tree' && req.method === 'GET') {
        const posts = await buildGlobalPublicFeed(env);
        const roots = posts.map((p) => ({
          id: p.noteId,
          kind: 'note' as const,
          title: p.title,
          noteId: p.noteId,
          visibility: 'public' as const,
          ownerId: p.ownerId,
        }));
        return json({ schemaVersion: 1, roots });
      }

      const pubNoteScoped = pathname.match(/^\/api\/public\/notes\/([^/]+)\/([^/]+)$/);
      if (pubNoteScoped && req.method === 'GET') {
        const ownerId = pubNoteScoped[1]!;
        const noteId = pubNoteScoped[2]!;
        const note = await loadUserNote(env, ownerId, noteId);
        if (!note || note.visibility !== 'public') return json({ error: 'not found' }, 404);
        return json(note);
      }

      const pubNoteLegacy = pathname.match(/^\/api\/public\/notes\/([^/]+)$/);
      if (pubNoteLegacy && req.method === 'GET') {
        const noteId = pubNoteLegacy[1]!;
        const userIds = await listKnownUserIds(env);
        const ownerId = await findNoteOwner(env, noteId, [...userIds, 'legacy']);
        if (!ownerId) return json({ error: 'not found' }, 404);
        const note = await loadUserNote(env, ownerId, noteId);
        if (!note || note.visibility !== 'public') return json({ error: 'not found' }, 404);
        return json({ ...note, ownerId });
      }

      const pubCommentsScoped = pathname.match(
        /^\/api\/public\/notes\/([^/]+)\/([^/]+)\/comments$/,
      );
      if (pubCommentsScoped) {
        const ownerId = pubCommentsScoped[1]!;
        const noteId = pubCommentsScoped[2]!;
        if (req.method === 'GET') {
          const note = await loadUserNote(env, ownerId, noteId);
          if (!note || note.visibility !== 'public') return json({ error: 'not found' }, 404);
          const data = await loadComments(env, ownerId, noteId);
          const sorted = [...data.comments].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
          return json({ comments: sorted });
        }
        if (req.method === 'POST') {
          const payload = (await req.json()) as {
            body?: string;
            author?: {
              guestId?: string;
              displayName?: string;
              avatarHue?: number;
            };
          };
          if (!payload.body?.trim()) return json({ error: 'empty body' }, 400);
          let author;
          if (user) {
            author = buildUserAuthor(user.id, user.email);
          } else {
            const guest = buildGuestAuthor({
              guestId: payload.author?.guestId ?? '',
              displayName: payload.author?.displayName ?? '',
              avatarHue: payload.author?.avatarHue,
            });
            if (!guest) return json({ error: 'invalid guest author' }, 400);
            author = guest;
          }
          const comment = await addComment(env, ownerId, noteId, payload.body, author);
          if (!comment) return json({ error: 'cannot comment' }, 400);
          return json(comment, 201);
        }
      }

      // ── Reminders (auth) ──
      if (pathname === '/api/reminders' && req.method === 'GET') {
        if (!user) return unauthorized();
        await migrateLegacyReminders(env, user.id);
        const index = await loadUserReminders(env, user.id);
        return json(index);
      }
      if (pathname === '/api/reminders' && req.method === 'POST') {
        if (!user) return unauthorized();
        const body = (await req.json()) as { text?: string };
        if (!body.text?.trim()) return json({ error: 'empty text' }, 400);
        const reminder = await addQuickReminder(env, user.id, body.text);
        return json(reminder, 201);
      }
      const reminderPatch = pathname.match(/^\/api\/reminders\/([^/]+)$/);
      if (reminderPatch && req.method === 'PATCH') {
        if (!user) return unauthorized();
        const body = (await req.json()) as { done?: boolean };
        const updated = await patchReminder(env, user.id, reminderPatch[1]!, body);
        if (!updated) return json({ error: 'not found' }, 404);
        return json(updated);
      }

      // ── Admin ──
      if (pathname === '/api/admin/users' && req.method === 'GET') {
        if (!requireAdmin(user)) return unauthorized();
        return json({ users: await listAdminUsers(env) });
      }
      const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
      if (adminUserMatch && req.method === 'PATCH') {
        if (!requireAdmin(user)) return unauthorized();
        const body = (await req.json()) as { disabled?: boolean };
        if (typeof body.disabled !== 'boolean') return json({ error: 'disabled required' }, 400);
        const updated = await updateAdminUser(env, adminUserMatch[1]!, body.disabled);
        if (!updated) return json({ error: 'not found' }, 404);
        return json(updated);
      }
      if (pathname === '/api/admin/settings' && req.method === 'GET') {
        if (!requireAdmin(user)) return unauthorized();
        return json(await loadSystemSettings(env));
      }
      if (pathname === '/api/admin/settings' && req.method === 'PUT') {
        if (!requireAdmin(user)) return unauthorized();
        const body = (await req.json()) as SystemSettings;
        await saveSystemSettings(env, body);
        return json({ ok: true });
      }
      if (pathname === '/api/admin/ai-strategies' && req.method === 'GET') {
        if (!requireAdmin(user)) return unauthorized();
        return json(await getAdminAiStrategies(env));
      }
      if (pathname === '/api/admin/ai-strategies' && req.method === 'PUT') {
        if (!requireAdmin(user)) return unauthorized();
        const body = (await req.json()) as AIStrategiesConfig;
        await putAdminAiStrategies(env, body);
        return json({ ok: true });
      }
      if (pathname === '/api/admin/public-notes' && req.method === 'GET') {
        if (!requireAdmin(user)) return unauthorized();
        return json({ posts: await adminListPublicNotes(env) });
      }
      const adminNoteMatch = pathname.match(/^\/api\/admin\/notes\/([^/]+)\/([^/]+)$/);
      if (adminNoteMatch && req.method === 'PATCH') {
        if (!requireAdmin(user)) return unauthorized();
        const body = (await req.json()) as { visibility?: NoteVisibility };
        if (body.visibility !== 'private' && body.visibility !== 'public' && body.visibility !== 'circle') {
          return json({ error: 'invalid visibility' }, 400);
        }
        try {
          await adminSetNoteVisibility(env, adminNoteMatch[1]!, adminNoteMatch[2]!, body.visibility);
          return json({ ok: true });
        } catch (e) {
          return json({ error: (e as Error).message }, 404);
        }
      }
      if (adminNoteMatch && req.method === 'DELETE') {
        if (!requireAdmin(user)) return unauthorized();
        try {
          await adminDeleteNote(env, adminNoteMatch[1]!, adminNoteMatch[2]!);
          return json({ ok: true });
        } catch (e) {
          return json({ error: (e as Error).message }, 404);
        }
      }

      // ── Circles (auth required) ──
      if (pathname === '/api/circles/discover' && req.method === 'GET') {
        if (!user) return unauthorized();
        return json({ circles: await listDiscoverableCircles(env, user.id) });
      }
      if (pathname === '/api/circles/join-requests' && req.method === 'GET') {
        if (!user) return unauthorized();
        return json({ requests: await listMyJoinRequests(env, user.id) });
      }
      if (pathname === '/api/circles' && req.method === 'GET') {
        if (!user) return unauthorized();
        return json({ circles: await listMyCircles(env, user.id) });
      }
      if (pathname === '/api/circles' && req.method === 'POST') {
        if (!user) return unauthorized();
        const body = (await req.json()) as {
          name?: string;
          description?: string;
          visibility?: 'private' | 'public';
          joinPolicy?: 'open' | 'approval';
        };
        const circle = await createCircle(env, user.id, user.email, body.name ?? '我的圈子', {
          description: body.description,
          visibility: body.visibility,
          joinPolicy: body.joinPolicy,
        });
        return json(circle, 201);
      }
      if (pathname === '/api/circles/invites' && req.method === 'GET') {
        if (!user) return unauthorized();
        return json({ invites: await listPendingInvites(env, user.email) });
      }

      const circleJoin = pathname.match(/^\/api\/circles\/([^/]+)\/join$/);
      if (circleJoin && req.method === 'POST') {
        if (!user) return unauthorized();
        try {
          const circle = await joinPublicCircle(env, circleJoin[1]!, user.id, user.email);
          return json(circle);
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
      }

      const circleRequest = pathname.match(/^\/api\/circles\/([^/]+)\/request$/);
      if (circleRequest && req.method === 'POST') {
        if (!user) return unauthorized();
        try {
          const circle = await requestJoinCircle(env, circleRequest[1]!, user.id, user.email);
          return json(circle);
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
      }

      const circleSettings = pathname.match(/^\/api\/circles\/([^/]+)\/settings$/);
      if (circleSettings && req.method === 'PATCH') {
        if (!user) return unauthorized();
        const body = (await req.json()) as {
          name?: string;
          description?: string;
          visibility?: 'private' | 'public';
          joinPolicy?: 'open' | 'approval';
        };
        try {
          const circle = await updateCircleSettings(env, circleSettings[1]!, user.id, body);
          return json(circle);
        } catch (e) {
          return json({ error: (e as Error).message }, 403);
        }
      }

      const circleApprove = pathname.match(/^\/api\/circles\/([^/]+)\/requests\/([^/]+)\/approve$/);
      if (circleApprove && req.method === 'POST') {
        if (!user) return unauthorized();
        try {
          const circle = await approveJoinRequest(
            env,
            circleApprove[1]!,
            user.id,
            circleApprove[2]!,
          );
          return json(circle);
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
      }

      const circleReject = pathname.match(/^\/api\/circles\/([^/]+)\/requests\/([^/]+)\/reject$/);
      if (circleReject && req.method === 'POST') {
        if (!user) return unauthorized();
        try {
          const circle = await rejectJoinRequest(
            env,
            circleReject[1]!,
            user.id,
            circleReject[2]!,
          );
          return json(circle);
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
      }

      const circleFeed = pathname.match(/^\/api\/circles\/([^/]+)\/feed$/);
      if (circleFeed && req.method === 'GET') {
        if (!user) return unauthorized();
        try {
          return json(await getCircleFeed(env, circleFeed[1]!, user.id));
        } catch (e) {
          return json({ error: (e as Error).message }, 403);
        }
      }

      const circleInvite = pathname.match(/^\/api\/circles\/([^/]+)\/invites$/);
      if (circleInvite && req.method === 'POST') {
        if (!user) return unauthorized();
        const body = (await req.json()) as { email?: string };
        try {
          const circle = await inviteToCircle(env, circleInvite[1]!, user.id, body.email ?? '');
          return json(circle);
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
      }

      const circleAccept = pathname.match(/^\/api\/circles\/([^/]+)\/accept$/);
      if (circleAccept && req.method === 'POST') {
        if (!user) return unauthorized();
        try {
          const circle = await acceptInvite(env, circleAccept[1]!, user.id, user.email);
          return json(circle);
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
      }

      const circleShare = pathname.match(/^\/api\/circles\/([^/]+)\/collab$/);
      if (circleShare && req.method === 'PATCH') {
        if (!user) return unauthorized();
        const body = (await req.json()) as { collabEdit?: boolean };
        if (typeof body.collabEdit !== 'boolean') {
          return json({ error: 'invalid collabEdit' }, 400);
        }
        try {
          const circle = await updateMyCollabEdit(
            env,
            circleShare[1]!,
            user.id,
            body.collabEdit,
          );
          return json(circle);
        } catch (e) {
          return json({ error: (e as Error).message }, 403);
        }
      }

      const circleMemberBlog = pathname.match(
        /^\/api\/circles\/([^/]+)\/member-blog\/([^/]+)\/([^/]+)$/,
      );
      if (circleMemberBlog && req.method === 'GET') {
        if (!user) return unauthorized();
        try {
          return json(
            await getCircleMemberBlogNote(
              env,
              circleMemberBlog[1]!,
              user.id,
              circleMemberBlog[2]!,
              circleMemberBlog[3]!,
            ),
          );
        } catch (e) {
          const msg = (e as Error).message;
          return json({ error: msg }, msg === 'not found' ? 404 : 403);
        }
      }

      const circleTreePath = pathname.match(/^\/api\/circles\/([^/]+)\/tree$/);
      if (circleTreePath) {
        if (!user) return unauthorized();
        const circleId = circleTreePath[1]!;
        if (req.method === 'GET') {
          try {
            await assertCircleMember(env, circleId, user.id);
            return json(await loadCircleTree(env, circleId));
          } catch (e) {
            return json({ error: (e as Error).message }, 403);
          }
        }
        if (req.method === 'PUT') {
          try {
            await assertCircleEditor(env, circleId, user.id);
            const tree = (await req.json()) as NoteTree;
            await saveCircleTree(env, circleId, tree);
            return json({ ok: true });
          } catch (e) {
            return json({ error: (e as Error).message }, 403);
          }
        }
      }

      const circleNotePath = pathname.match(/^\/api\/circles\/([^/]+)\/notes\/([^/]+)$/);
      if (circleNotePath) {
        if (!user) return unauthorized();
        const circleId = circleNotePath[1]!;
        const noteId = circleNotePath[2]!;
        if (req.method === 'GET') {
          try {
            await assertCircleMember(env, circleId, user.id);
            const note = await loadCircleNote(env, circleId, noteId);
            if (!note) return json({ error: 'not found' }, 404);
            return json(note);
          } catch (e) {
            return json({ error: (e as Error).message }, 403);
          }
        }
        if (req.method === 'PUT') {
          try {
            await assertCircleEditor(env, circleId, user.id);
            const note = normalizeNote((await req.json()) as Note);
            if (note.id !== noteId) return json({ error: 'id mismatch' }, 400);
            await saveCircleNote(env, circleId, note);
            return json({ ok: true });
          } catch (e) {
            return json({ error: (e as Error).message }, 403);
          }
        }
        if (req.method === 'DELETE') {
          try {
            await assertCircleEditor(env, circleId, user.id);
            await deleteCircleNote(env, circleId, noteId);
            return json({ ok: true });
          } catch (e) {
            return json({ error: (e as Error).message }, 403);
          }
        }
      }

      const circleMember = pathname.match(/^\/api\/circles\/([^/]+)\/members\/([^/]+)$/);
      if (circleMember && req.method === 'DELETE') {
        if (!user) return unauthorized();
        try {
          const circle = await removeMember(env, circleMember[1]!, user.id, circleMember[2]!);
          return json(circle);
        } catch (e) {
          return json({ error: (e as Error).message }, 403);
        }
      }

      const circleOne = pathname.match(/^\/api\/circles\/([^/]+)$/);
      if (circleOne && req.method === 'GET') {
        if (!user) return unauthorized();
        try {
          return json(await getCircleDetail(env, circleOne[1]!, user.id));
        } catch (e) {
          return json({ error: (e as Error).message }, 403);
        }
      }

      // ── Legacy data migration ──
      if (pathname === '/api/migrate/legacy' && req.method === 'POST') {
        if (!user) return unauthorized();
        const result = await migrateLegacyToUser(env, user.id, user.email);
        return json(result);
      }

      // ── User tree ──
      if (pathname === '/api/tree') {
        if (req.method === 'GET') {
          if (!user) {
            const posts = await buildGlobalPublicFeed(env);
            const roots = posts.map((p) => ({
              id: p.noteId,
              kind: 'note' as const,
              title: p.title,
              noteId: p.noteId,
              visibility: 'public' as const,
            }));
            return json({ schemaVersion: 1, roots });
          }
          let tree = await loadUserTree(env, user.id);
          const migration = await migrateLegacyToUser(env, user.id, user.email);
          if (migration.merged) {
            tree = await loadUserTree(env, user.id);
          }
          return json(tree);
        }
        if (req.method === 'PUT') {
          if (!user) return unauthorized();
          const body = await req.text();
          const tree = JSON.parse(body) as NoteTree;
          await saveUserTree(env, user.id, user.email, tree);
          return json({ ok: true });
        }
      }

      // ── Notes ──
      const versionMatch = pathname.match(/^\/api\/notes\/([^/]+)\/versions\/([^/]+)$/);
      if (versionMatch && req.method === 'GET') {
        if (!user) return unauthorized();
        const note = await loadUserNoteAtSha(env, user.id, versionMatch[1]!, versionMatch[2]!);
        if (!note) return json({ error: 'not found' }, 404);
        return json(note);
      }

      const noteMatch = pathname.match(/^\/api\/notes\/([^/]+)(\/history)?$/);
      if (noteMatch && user) {
        const id = noteMatch[1]!;
        const isHistory = Boolean(noteMatch[2]);

        if (isHistory && req.method === 'GET') {
          return json({ commits: await userNoteHistory(env, user.id, id) });
        }

        if (req.method === 'GET') {
          const note = await loadUserNote(env, user.id, id);
          if (!note) return json({ error: 'not found' }, 404);
          return json(note);
        }

        if (req.method === 'PUT') {
          const body = await req.text();
          const note = normalizeNote(JSON.parse(body) as Note);
          await saveUserNote(env, user.id, user.email, note);

          const tree = await loadUserTree(env, user.id);
          const synced = syncNoteVisibility(tree, id, note.visibility);
          await saveUserTree(env, user.id, user.email, synced);

          try {
            await mergeTodosFromNote(env, user.id, note);
          } catch {
            /* non-blocking */
          }
          return json({ ok: true });
        }

        if (req.method === 'DELETE') {
          await deleteUserNote(env, user.id, id);
          return json({ ok: true });
        }
      }

      // Public note read without auth (by id in own... no, use public routes)

      // ── Assets ──
      const assetGet = pathname.match(/^\/api\/assets\/([^/]+)$/);
      if (assetGet && req.method === 'GET') {
        const name = assetGet[1]!;
        if (!/^[\w.-]+\.(png|jpe?g|gif|webp)$/i.test(name)) {
          return json({ error: 'invalid asset' }, 400);
        }
        let bytes = user ? await getBinaryFile(env, `data/users/${user.id}/assets/${name}`) : null;
        if (!bytes) bytes = await getBinaryFile(env, `data/assets/${name}`);
        if (!bytes) return json({ error: 'not found' }, 404);
        const ext = name.split('.').pop()?.toLowerCase() ?? 'png';
        const mime =
          ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : ext === 'gif'
              ? 'image/gif'
              : ext === 'webp'
                ? 'image/webp'
                : 'image/png';
        return new Response(bytes.buffer as ArrayBuffer, {
          headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400', ...CORS },
        });
      }

      if (pathname === '/api/assets/upload' && req.method === 'POST') {
        if (!user) return unauthorized();
        const form = await req.formData();
        const file = form.get('file');
        if (!(file instanceof File)) return json({ error: 'missing file' }, 400);
        if (!file.type.startsWith('image/')) return json({ error: 'images only' }, 400);
        if (file.size > 5 * 1024 * 1024) return json({ error: 'max 5MB' }, 400);
        const ext = mimeToExt(file.type);
        const filename = `${crypto.randomUUID()}.${ext}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        await putBinaryFile(
          env,
          `data/users/${user.id}/assets/${filename}`,
          bytes,
          `asset: ${filename}`,
        );
        return json({ url: `/api/assets/${filename}` });
      }

      if (pathname === '/api/link-preview' && req.method === 'GET') {
        const target = url.searchParams.get('url');
        if (!target) return json({ error: 'missing url' }, 400);
        return json(await fetchLinkMeta(target));
      }

      if (pathname === '/api/ai/chat' && req.method === 'POST') {
        if (!user) return unauthorized();
        const body = (await req.json()) as {
          note: Note;
          messages: { role: 'user' | 'assistant'; content: string }[];
        };
        if (!body.note || !Array.isArray(body.messages) || body.messages.length === 0) {
          return json({ error: 'note and messages required' }, 400);
        }
        const last = body.messages[body.messages.length - 1];
        if (!last || last.role !== 'user' || !last.content.trim()) {
          return json({ error: 'last message must be non-empty user message' }, 400);
        }
        const result = await assistNoteChat(env, normalizeNote(body.note), body.messages);
        return json({ reply: result.reply, noteMarkdown: result.noteMarkdown });
      }

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
    await runCronStrategies(env);
  },
};

function mimeToExt(mime: string): string {
  if (mime.includes('jpeg')) return 'jpg';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('webp')) return 'webp';
  return 'png';
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
