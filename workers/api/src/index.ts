import type { Env } from './env';
import { resolveAssetBytes } from './assets';
import {
  ensureVolumeRegistry,
  isVolumeId,
  loadVolumeRegistry,
  MAX_ASSET_BYTES,
  storeUserAsset,
} from './volumes';
import { summarizeNote, assistNoteChat, streamNoteChat } from './ai';
import { listAiProviders, runAiGenerate } from './ai/generateProviders';
import { refreshAiJob } from './ai/jobs';
import type { AiGenerateRequest } from '@webbook/shared';
import { extractBearer, verifyUserToken } from './auth';
import { loadUserPlanWithSha, saveUserPlan, migrateRemindersIntoPlan } from './plan';
import { FileConflictError } from './github';
import { loadUserProfile, saveUserProfile } from './userProfile';
import { getNoteVisibilityInTree, syncNoteVisibility } from './tree-filter';
import { loadComments, addComment, buildUserAuthor, buildGuestAuthor } from './comments';
import type { Note, NoteTree, NoteVisibility } from '@webbook/shared';
import {
  isExpenseCategory,
  isNotifyRepeat,
  normalizeNote,
  normalizePlan,
  NOTIFY_DUE_WINDOW_DAYS,
  USAGE_BACKFILL_MAX_DAYS,
} from '@webbook/shared';
import type { AIStrategiesConfig, SystemSettings } from '@webbook/shared';
import {
  loadUserTree,
  loadUserTreeWithRev,
  loadUserNote,
  saveUserNote,
  deleteUserNote,
  loadUserNoteAtSha,
  userNoteHistory,
  findNoteOwner,
  getUserTreeRev,
  saveUserTreeConditional,
  loadUserTreeAtRef,
  userTreeHistory,
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
import { migrateLegacyToUser } from './migrateLegacy';
import { runCronStrategies } from './aiStrategies';
import {
  loadUsageDay,
  saveUsageDays,
  loadUsageRange,
  listUsageDates,
  deleteUsageRange,
  loadExpenseOverview,
  saveExpensesBulk,
  updateExpenseCategory,
  deleteExpense,
} from './tracking';
import {
  loadNotifyIndex,
  createNotifyItem,
  patchNotifyItem,
  deleteNotifyItem,
  getDueInstances,
  markNotifyDelivered,
} from './notify';
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
import {
  handleFeishuStatus,
  handleFeishuOAuthStart,
  handleFeishuOAuthCallback,
  handleFeishuOAuthUnbind,
  handleFeishuFolders,
  handleFeishuExport,
} from './feishu';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,DELETE,POST,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/** 目录树历史一次性返回的最大版本数（完整历史仍在 git 中） */
const MAX_TREE_VERSIONS = 30;

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
        const profile = await loadUserProfile(env, ownerId);
        return json({
          ownerId,
          ownerEmail: email,
          posts,
          featuredNoteId: profile.featuredNoteId,
          site: profile.site ?? null,
        });
      }

      // ── Public site config (readable by any visitor) ──
      const publicSiteMatch = pathname.match(/^\/api\/public\/users\/([^/]+)\/site$/);
      if (publicSiteMatch && req.method === 'GET') {
        const ownerId = publicSiteMatch[1]!;
        const profile = await loadUserProfile(env, ownerId);
        return json({ ownerId, site: profile.site ?? null });
      }

      if (pathname === '/api/profile/featured' && req.method === 'PUT') {
        if (!user) return unauthorized();
        const body = (await req.json().catch(() => ({}))) as { noteId?: string | null };
        const profile = await loadUserProfile(env, user.id);
        if (body.noteId) {
          profile.featuredNoteId = body.noteId;
        } else {
          delete profile.featuredNoteId;
        }
        await saveUserProfile(env, user.id, profile);
        return json({ ok: true, featuredNoteId: profile.featuredNoteId });
      }

      if (pathname === '/api/profile/site' && req.method === 'PUT') {
        if (!user) return unauthorized();
        const body = (await req.json().catch(() => ({}))) as {
          site?: {
            workNoteIds?: string[];
            blogNoteIds?: string[];
            blogCategoryOrder?: string[];
          };
        };
        const profile = await loadUserProfile(env, user.id);
        profile.site = body.site ?? {};
        await saveUserProfile(env, user.id, profile);
        return json({ ok: true, site: profile.site });
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

      // ── 任务规划（单文件 + 乐观锁，design D1/D2）──
      if (pathname === '/api/plan' && req.method === 'GET') {
        if (!user) return unauthorized();
        const loaded = await loadUserPlanWithSha(env, user.id);
        // 首次加载时把旧 reminders 并进来（幂等）
        const migrated = await migrateRemindersIntoPlan(env, user.id, loaded);
        return json(migrated);
      }
      if (pathname === '/api/plan' && req.method === 'PUT') {
        if (!user) return unauthorized();
        const body = (await req.json().catch(() => null)) as {
          plan?: unknown;
          baseSha?: string | null;
        } | null;
        if (!body || body.plan === undefined) return json({ error: 'plan required' }, 400);
        const plan = normalizePlan(body.plan);
        const baseSha = body.baseSha === undefined ? undefined : body.baseSha;
        try {
          const nextSha = await saveUserPlan(env, user.id, plan, baseSha);
          return json({ ok: true, baseSha: nextSha });
        } catch (e) {
          // 冲突必须原样暴露给客户端：外层 catch 会把任何异常压成 500，
          // 那客户端就分不清"该重拉重放"还是"该报错重试"。
          // 只认 FileConflictError——网络/权限错误报成 409 会诱发无意义的重放。
          if (e instanceof FileConflictError) {
            return json({ error: 'conflict', baseSha: e.actualSha }, 409);
          }
          throw e;
        }
      }

      /* ══════════ 手机采集数据（native-android-companion）══════════
       *
       * 三条数据线的共同纪律：
       *   - 归属只取 JWT 里的 user.id，绝不采信请求体里的 userId（否则可越权读写他人数据）
       *   - 未登录一律 unauthorized()
       *   - 这些路径都在 data/users/{userId}/ 下，不经过任何 /api/public/* 出口，
       *     因此天然满足"不通过公开途径暴露"（公开路由只读 tree/notes 的 public 可见性）
       */

      // ── 使用统计 ──
      if (pathname === '/api/tracking/usage/sync' && req.method === 'POST') {
        if (!user) return unauthorized();
        const body = (await req.json().catch(() => null)) as { days?: unknown } | null;
        if (!body || !Array.isArray(body.days)) return json({ error: 'days required' }, 400);
        // 上限保护：一次上报的日期数不应超过回溯窗口，避免被当作批量写入通道
        if (body.days.length > USAGE_BACKFILL_MAX_DAYS * 4) {
          return json({ error: 'too many days' }, 400);
        }
        const written = await saveUsageDays(env, user.id, body.days);
        return json({ ok: true, written });
      }
      if (pathname === '/api/tracking/usage' && req.method === 'GET') {
        if (!user) return unauthorized();
        const date = url.searchParams.get('date');
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        if (date) {
          const day = await loadUsageDay(env, user.id, date);
          return json({ date, day });
        }
        if (!from || !to) return json({ error: 'date or from+to required' }, 400);
        return json({ days: await loadUsageRange(env, user.id, from, to) });
      }
      if (pathname === '/api/tracking/usage/dates' && req.method === 'GET') {
        if (!user) return unauthorized();
        return json({ dates: await listUsageDates(env, user.id) });
      }
      if (pathname === '/api/tracking/usage' && req.method === 'DELETE') {
        if (!user) return unauthorized();
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        if (!from || !to) return json({ error: 'from+to required' }, 400);
        return json({ ok: true, deleted: await deleteUsageRange(env, user.id, from, to) });
      }

      // ── 消费记账 ──
      if (pathname === '/api/tracking/expenses/bulk' && req.method === 'POST') {
        if (!user) return unauthorized();
        const body = (await req.json().catch(() => null)) as { expenses?: unknown } | null;
        if (!body || !Array.isArray(body.expenses)) {
          return json({ error: 'expenses required' }, 400);
        }
        // 一次提交的批量上限：既防滥用，也保证单次请求不会拖垮 Worker
        if (body.expenses.length > 200) return json({ error: 'too many expenses' }, 400);
        return json(await saveExpensesBulk(env, user.id, body.expenses));
      }
      if (pathname === '/api/tracking/expenses' && req.method === 'GET') {
        if (!user) return unauthorized();
        const month = url.searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
        return json(await loadExpenseOverview(env, user.id, month));
      }
      const expensePatch = pathname.match(/^\/api\/tracking\/expenses\/([^/]+)$/);
      if (expensePatch && req.method === 'PATCH') {
        if (!user) return unauthorized();
        const body = (await req.json().catch(() => null)) as { category?: unknown } | null;
        if (!body || !isExpenseCategory(body.category)) {
          return json({ error: 'valid category required' }, 400);
        }
        const updated = await updateExpenseCategory(
          env,
          user.id,
          expensePatch[1]!,
          body.category,
        );
        if (!updated) return json({ error: 'not found' }, 404);
        return json(updated);
      }
      if (expensePatch && req.method === 'DELETE') {
        if (!user) return unauthorized();
        const removed = await deleteExpense(env, user.id, expensePatch[1]!);
        if (!removed) return json({ error: 'not found' }, 404);
        return json({ ok: true, removed });
      }

      // ── 到点提醒（读写 notify.json，与 reminders.json 完全隔离）──
      if (pathname === '/api/notify' && req.method === 'GET') {
        if (!user) return unauthorized();
        return json(await loadNotifyIndex(env, user.id));
      }
      if (pathname === '/api/notify' && req.method === 'POST') {
        if (!user) return unauthorized();
        const body = (await req.json().catch(() => null)) as {
          title?: unknown;
          body?: unknown;
          dueAt?: unknown;
          repeat?: unknown;
        } | null;
        if (!body || typeof body.title !== 'string' || !body.title.trim()) {
          return json({ error: 'title required' }, 400);
        }
        const item = await createNotifyItem(env, user.id, {
          title: body.title,
          ...(typeof body.body === 'string' ? { body: body.body } : {}),
          ...(typeof body.dueAt === 'string' ? { dueAt: body.dueAt } : {}),
          ...(isNotifyRepeat(body.repeat) ? { repeat: body.repeat } : {}),
        });
        if (!item) return json({ error: 'invalid reminder' }, 400);
        return json(item, 201);
      }
      // 注意：/due 必须在 /api/notify/:id 之前匹配，否则会被当成 id
      if (pathname === '/api/notify/due' && req.method === 'GET') {
        if (!user) return unauthorized();
        const raw = Number(url.searchParams.get('windowDays'));
        const windowDays =
          Number.isFinite(raw) && raw > 0 && raw <= 30 ? Math.floor(raw) : NOTIFY_DUE_WINDOW_DAYS;
        return json(await getDueInstances(env, user.id, windowDays));
      }
      const notifyItemMatch = pathname.match(/^\/api\/notify\/([^/]+)$/);
      if (notifyItemMatch && req.method === 'PATCH') {
        if (!user) return unauthorized();
        const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return json({ error: 'body required' }, 400);
        const patch: Parameters<typeof patchNotifyItem>[3] = {};
        if (typeof body.title === 'string') patch.title = body.title;
        if (typeof body.body === 'string') patch.body = body.body;
        if (typeof body.done === 'boolean') patch.done = body.done;
        if (isNotifyRepeat(body.repeat)) patch.repeat = body.repeat;
        if (body.dueAt === null) patch.dueAt = null;
        else if (typeof body.dueAt === 'string') patch.dueAt = body.dueAt;
        // 送达回写走独立端点，不在这里暴露，避免客户端伪造"已送达"
        const updated = await patchNotifyItem(env, user.id, notifyItemMatch[1]!, patch);
        if (!updated) return json({ error: 'not found' }, 404);
        return json(updated);
      }
      if (notifyItemMatch && req.method === 'DELETE') {
        if (!user) return unauthorized();
        const ok = await deleteNotifyItem(env, user.id, notifyItemMatch[1]!);
        if (!ok) return json({ error: 'not found' }, 404);
        return json({ ok: true });
      }
      // 送达回写：手机在触发后调用，使云端可区分"已排程"与"已送达"
      const notifyDeliveredMatch = pathname.match(/^\/api\/notify\/([^/]+)\/delivered$/);
      if (notifyDeliveredMatch && req.method === 'POST') {
        if (!user) return unauthorized();
        const body = (await req.json().catch(() => null)) as { at?: unknown } | null;
        const at = typeof body?.at === 'string' ? body.at : undefined;
        const updated = await markNotifyDelivered(
          env,
          user.id,
          notifyDeliveredMatch[1]!,
          at,
        );
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

      // ── User tree（乐观锁：读带 _rev，写必须带 baseRev）──
      // 目录树是"整棵文件覆盖"的写入，历史上一次无校验的写就抹掉过用户 23 个栏目。
      // 因此读取附带 revision，写入走 compare-and-swap，冲突原样上报给客户端决定。
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
            // 公开目录是只读投影，没有可写路径，故不提供 _rev
            return json({ schemaVersion: 1, roots });
          }
          let tree = await loadUserTree(env, user.id);
          const migration = await migrateLegacyToUser(env, user.id, user.email);
          if (migration.merged) {
            tree = await loadUserTree(env, user.id);
          }
          // 迁移可能刚刚写过树，因此 rev 必须最后读取，否则会把过期 revision 交给客户端
          const rev = await getUserTreeRev(env, user.id);
          return json({ ...tree, _rev: rev });
        }
        if (req.method === 'PUT') {
          if (!user) return unauthorized();
          const body = (await req.json().catch(() => null)) as {
            tree?: unknown;
            baseRev?: string | null;
          } | null;
          if (!body || body.tree === undefined) return json({ error: 'tree required' }, 400);
          // 必须显式携带 baseRev（即使是 null，表示"文件应当还不存在"）。
          // 缺省即放行会退回 last-write-wins，正是本次要堵的口子。
          if (!('baseRev' in body)) return json({ error: 'missing_baseRev' }, 400);
          const baseRev = body.baseRev ?? null;
          try {
            const nextRev = await saveUserTreeConditional(
              env,
              user.id,
              user.email,
              body.tree as NoteTree,
              baseRev,
            );
            return json({ ok: true, _rev: nextRev });
          } catch (e) {
            // 冲突必须原样暴露给客户端：外层 catch 会把任何异常压成 500，
            // 那客户端就分不清"该拉取后重做"还是"该报错重试"。
            // 只认 FileConflictError——网络/权限错误报成 409 会诱发无意义的覆盖。
            if (e instanceof FileConflictError) {
              return json({ error: 'conflict', _rev: e.actualSha }, 409);
            }
            throw e;
          }
        }
      }

      // ── User tree history / version（owner-only，只读）──
      if (pathname === '/api/tree/history' && req.method === 'GET') {
        if (!user) return unauthorized();
        const versions = await userTreeHistory(env, user.id);
        return json({ versions: versions.slice(0, MAX_TREE_VERSIONS) });
      }

      const treeVersionMatch = pathname.match(/^\/api\/tree\/versions\/([^/]+)$/);
      if (treeVersionMatch && req.method === 'GET') {
        if (!user) return unauthorized();
        const sha = treeVersionMatch[1]!;
        if (!/^[0-9a-f]{7,40}$/i.test(sha)) return json({ error: 'not found' }, 404);
        const tree = await loadUserTreeAtRef(env, user.id, sha);
        if (!tree) return json({ error: 'not found' }, 404);
        return json(tree);
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

          // 目录树可见性同步是"整树读-改-写"，因此也必须带 revision。
          // 原先的无条件写与客户端并发时会覆盖对方刚写入的目录结构——同一类事故的另一个入口。
          // 尽力而为：笔记本身已经保存成功，同步失败不应把整次保存报成失败；
          // 下次保存会重试，且 feed 侧对"树与笔记可见性不一致"本就按不收录处理。
          for (let attempt = 0; attempt < 2; attempt++) {
            const { tree, rev } = await loadUserTreeWithRev(env, user.id);
            if (getNoteVisibilityInTree(tree, id) === note.visibility) break;
            const synced = syncNoteVisibility(tree, id, note.visibility);
            try {
              await saveUserTreeConditional(env, user.id, user.email, synced, rev);
              break;
            } catch (e) {
              // 只对冲突重读重试一次；其它错误（网络/权限）放弃同步
              if (!(e instanceof FileConflictError)) break;
            }
          }

          return json({ ok: true });
        }

        if (req.method === 'DELETE') {
          await deleteUserNote(env, user.id, id);
          return json({ ok: true });
        }
      }

      // Public note read without auth (by id in own... no, use public routes)

      // ── Assets（分卷：/api/assets/vol-xx/name ；兼容旧 /api/assets/name）──
      const assetVolGet = pathname.match(/^\/api\/assets\/(vol-[\w.-]+)\/([^/]+)$/i);
      if (assetVolGet && req.method === 'GET') {
        const volumeId = assetVolGet[1]!;
        const name = assetVolGet[2]!;
        if (!isSafeAssetName(name)) return json({ error: 'invalid asset' }, 400);
        const bytes = await resolveAssetBytes(env, name, user, volumeId);
        if (!bytes) return json({ error: 'not found' }, 404);
        return assetResponse(name, bytes);
      }

      const assetGet = pathname.match(/^\/api\/assets\/([^/]+)$/);
      if (assetGet && req.method === 'GET') {
        const name = assetGet[1]!;
        if (isVolumeId(name)) return json({ error: 'missing asset filename' }, 400);
        if (!isSafeAssetName(name)) return json({ error: 'invalid asset' }, 400);
        const bytes = await resolveAssetBytes(env, name, user, null);
        if (!bytes) return json({ error: 'not found' }, 404);
        return assetResponse(name, bytes);
      }

      if (pathname === '/api/assets/upload' && req.method === 'POST') {
        if (!user) return unauthorized();
        const form = await req.formData();
        const file = form.get('file');
        if (!(file instanceof File)) return json({ error: 'missing file' }, 400);
        if (!isAllowedUploadMime(file.type, file.name)) {
          return json({ error: 'unsupported type (image/video/glb)' }, 400);
        }
        if (file.size > MAX_ASSET_BYTES) {
          return json({ error: `max ${MAX_ASSET_BYTES} bytes` }, 400);
        }
        const ext = mimeToExt(file.type || '', file.name);
        const filename = `${crypto.randomUUID()}.${ext}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        try {
          const stored = await storeUserAsset(
            env,
            user.id,
            filename,
            bytes,
            `asset: ${filename}`,
          );
          return json({ url: stored.url, volumeId: stored.volumeId });
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
      }

      if (pathname === '/api/storage/volumes' && req.method === 'GET') {
        if (!user) return unauthorized();
        const registry = await loadVolumeRegistry(env);
        return json(registry);
      }

      if (pathname === '/api/storage/volumes/ensure' && req.method === 'POST') {
        if (!requireAdmin(user)) return unauthorized();
        const registry = await ensureVolumeRegistry(env);
        return json(registry);
      }

      if (pathname === '/api/feishu/oauth/callback' && req.method === 'GET') {
        return handleFeishuOAuthCallback(env, req);
      }

      if (pathname === '/api/feishu/status' && req.method === 'GET') {
        if (!user) return unauthorized();
        return handleFeishuStatus(env, user);
      }

      if (pathname === '/api/feishu/oauth/start' && req.method === 'GET') {
        if (!user) return unauthorized();
        const returnTo = url.searchParams.get('return_to') || '';
        return handleFeishuOAuthStart(env, user, returnTo);
      }

      if (pathname === '/api/feishu/oauth' && req.method === 'DELETE') {
        if (!user) return unauthorized();
        return handleFeishuOAuthUnbind(env, user);
      }

      if (pathname === '/api/feishu/folders' && req.method === 'GET') {
        if (!user) return unauthorized();
        const parent = url.searchParams.get('parent');
        return handleFeishuFolders(env, user, parent);
      }

      if (pathname === '/api/feishu/export' && req.method === 'POST') {
        if (!user) return unauthorized();
        return handleFeishuExport(env, user, req);
      }

      if (pathname === '/api/link-preview' && req.method === 'GET') {
        const target = url.searchParams.get('url');
        if (!target) return json({ error: 'missing url' }, 400);
        return json(await fetchLinkMeta(target));
      }

      if (pathname === '/api/ai/providers' && req.method === 'GET') {
        if (!user) return unauthorized();
        return json(listAiProviders(env));
      }

      if (pathname === '/api/ai/generate' && req.method === 'POST') {
        if (!user) return unauthorized();
        const body = (await req.json()) as AiGenerateRequest;
        if (!body?.kind || !body.provider || !body.model || typeof body.prompt !== 'string') {
          return json({ error: 'kind, provider, model, prompt required' }, 400);
        }
        const result = await runAiGenerate(
          env,
          body,
          async (bytes, mime) => {
            const ext = mimeToExt(mime);
            const filename = `${crypto.randomUUID()}.${ext}`;
            const stored = await storeUserAsset(
              env,
              user.id,
              filename,
              bytes,
              `ai asset: ${filename}`,
            );
            return stored.url;
          },
          user,
        );
        return json(result);
      }

      const aiJobMatch = pathname.match(/^\/api\/ai\/jobs\/([^/]+)$/);
      if (aiJobMatch && req.method === 'GET') {
        if (!user) return unauthorized();
        try {
          const job = await refreshAiJob(env, user, aiJobMatch[1]!);
          return json(job);
        } catch (e) {
          const msg = (e as Error).message;
          if (msg === 'job not found') return json({ error: msg }, 404);
          return json({ error: msg }, 400);
        }
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

      if (pathname === '/api/ai/chat/stream' && req.method === 'POST') {
        if (!user) return unauthorized();
        const body = (await req.json()) as {
          note: Note;
          messages: { role: 'user' | 'assistant'; content: string }[];
        };
        if (!body.note || !Array.isArray(body.messages) || body.messages.length === 0) {
          return json({ error: 'note and messages required' }, 400);
        }
        const stream = streamNoteChat(env, normalizeNote(body.note), body.messages);
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
            ...CORS,
          },
        });
      }

      if (pathname === '/api/ai/run' && req.method === 'POST') {
        if (!user) return unauthorized();
        const { action, note } = (await req.json()) as { action: string; note: Note };
        if (action === 'summarize') return json({ summary: await summarizeNote(env, note) });
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

function mimeToExt(mime: string, fileName?: string): string {
  const fromName = fileName?.split('.').pop()?.toLowerCase();
  if (mime.includes('jpeg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('mp4') || mime === 'video/mp4') return 'mp4';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('gltf-binary') || mime === 'model/gltf-binary') return 'glb';
  if (fromName && /^[\w]+$/.test(fromName)) return fromName;
  return 'bin';
}

const UPLOAD_EXT_RE =
  /\.(png|jpe?g|gif|webp|bmp|svg|avif|mp4|webm|mov|m4v|mkv|glb|bin)$/i;

function isAllowedUploadMime(mime: string, fileName?: string): boolean {
  const m = (mime || '').trim().toLowerCase();
  if (
    m.startsWith('image/') ||
    m.startsWith('video/') ||
    m === 'model/gltf-binary' ||
    m === 'application/octet-stream' ||
    m === 'application/mp4'
  ) {
    return true;
  }
  // 部分客户端/ zip 解出的 File.type 为空：按扩展名放行
  if (!m && fileName && UPLOAD_EXT_RE.test(fileName)) return true;
  return false;
}

function isSafeAssetName(name: string): boolean {
  return /^[\w.-]+\.(png|jpe?g|gif|webp|mp4|webm|mov|m4v|mkv|glb|bin)$/i.test(name);
}

function mimeFromAssetName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? 'bin';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'png') return 'image/png';
  if (ext === 'mp4' || ext === 'm4v') return 'video/mp4';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'mkv') return 'video/x-matroska';
  if (ext === 'glb') return 'model/gltf-binary';
  return 'application/octet-stream';
}

function assetResponse(name: string, bytes: Uint8Array): Response {
  return new Response(bytes.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': mimeFromAssetName(name),
      'Cache-Control': 'public, max-age=86400',
      ...CORS,
    },
  });
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
