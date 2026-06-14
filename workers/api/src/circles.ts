import type { Env } from './env';
import { getFile, putFile } from './github';
import type {
  Circle,
  CircleJoinPolicy,
  CircleMember,
  CircleSummary,
  CircleVisibility,
  DiscoverableCircle,
} from '@webbook/shared';
import {
  CIRCLE_SCHEMA_VERSION,
  CIRCLE_PATH,
  PUBLIC_CIRCLES_INDEX_PATH,
  USER_CIRCLES_INDEX_PATH,
} from '@webbook/shared';
import { buildCircleFeed } from './publicFeed';
import { loadUserNote } from './userData';
import { getUserEmail } from './usersRegistry';

interface UserCirclesIndex {
  schemaVersion: number;
  owned: string[];
  memberOf: string[];
}

interface PublicCirclesIndex {
  schemaVersion: number;
  ids: string[];
}

type LegacyMember = CircleMember & { shareStatus?: 'none' | 'public_feed' };
type LegacyCircle = Circle & {
  members: LegacyMember[];
  visibility?: CircleVisibility;
  joinPolicy?: CircleJoinPolicy;
  pendingJoinRequests?: Circle['pendingJoinRequests'];
};

function normalizeMember(raw: LegacyMember): CircleMember {
  const collabEdit =
    raw.collabEdit ??
    (raw.role === 'owner' ? true : raw.shareStatus === 'public_feed');
  return {
    userId: raw.userId,
    email: raw.email,
    role: raw.role,
    collabEdit,
    joinedAt: raw.joinedAt,
  };
}

function normalizeCircle(raw: LegacyCircle): Circle {
  return {
    schemaVersion: CIRCLE_SCHEMA_VERSION,
    id: raw.id,
    name: raw.name,
    description: raw.description ?? '',
    visibility: raw.visibility ?? 'private',
    joinPolicy: raw.joinPolicy ?? 'approval',
    ownerId: raw.ownerId,
    members: raw.members.map(normalizeMember),
    pendingInvites: raw.pendingInvites ?? [],
    pendingJoinRequests: raw.pendingJoinRequests ?? [],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

async function loadUserCirclesIndex(env: Env, userId: string): Promise<UserCirclesIndex> {
  const raw = await getFile(env, USER_CIRCLES_INDEX_PATH(userId));
  if (!raw) return { schemaVersion: 1, owned: [], memberOf: [] };
  const data = JSON.parse(raw) as UserCirclesIndex;
  return {
    schemaVersion: 1,
    owned: data.owned ?? [],
    memberOf: data.memberOf ?? [],
  };
}

async function saveUserCirclesIndex(env: Env, userId: string, index: UserCirclesIndex) {
  await putFile(
    env,
    USER_CIRCLES_INDEX_PATH(userId),
    JSON.stringify(index, null, 2),
    `circles index ${userId}`,
  );
}

async function loadPublicCirclesIndex(env: Env): Promise<PublicCirclesIndex> {
  const raw = await getFile(env, PUBLIC_CIRCLES_INDEX_PATH);
  if (!raw) return { schemaVersion: 1, ids: [] };
  const data = JSON.parse(raw) as PublicCirclesIndex;
  return { schemaVersion: 1, ids: data.ids ?? [] };
}

async function savePublicCirclesIndex(env: Env, index: PublicCirclesIndex) {
  await putFile(
    env,
    PUBLIC_CIRCLES_INDEX_PATH,
    JSON.stringify(index, null, 2),
    'public circles index',
  );
}

async function syncPublicCirclesIndex(env: Env, circle: Circle) {
  const index = await loadPublicCirclesIndex(env);
  const set = new Set(index.ids);
  if (circle.visibility === 'public') {
    set.add(circle.id);
  } else {
    set.delete(circle.id);
  }
  index.ids = [...set];
  await savePublicCirclesIndex(env, index);
}

export async function loadCircle(env: Env, circleId: string): Promise<Circle | null> {
  const raw = await getFile(env, CIRCLE_PATH(circleId));
  if (!raw) return null;
  return normalizeCircle(JSON.parse(raw) as LegacyCircle);
}

async function saveCircle(env: Env, circle: Circle): Promise<void> {
  circle.updatedAt = new Date().toISOString();
  await putFile(
    env,
    CIRCLE_PATH(circle.id),
    JSON.stringify(circle, null, 2),
    `circle: ${circle.name}`,
  );
  await syncPublicCirclesIndex(env, circle);
}

function summarize(circle: Circle, userId: string): CircleSummary {
  const me = circle.members.find((m) => m.userId === userId);
  return {
    id: circle.id,
    name: circle.name,
    ownerId: circle.ownerId,
    memberCount: circle.members.length,
    visibility: circle.visibility,
    joinPolicy: circle.joinPolicy,
    description: circle.description,
    myRole: me?.role,
    myCollabEdit: me?.collabEdit,
  };
}

export function isMember(circle: Circle, userId: string): boolean {
  return circle.members.some((m) => m.userId === userId);
}

export function canEditCircleNotes(circle: Circle, userId: string): boolean {
  const me = circle.members.find((m) => m.userId === userId);
  if (!me) return false;
  return me.role === 'owner' || me.collabEdit;
}

async function addMember(
  env: Env,
  circle: Circle,
  userId: string,
  email: string,
): Promise<Circle> {
  if (isMember(circle, userId)) return circle;
  const normalized = email.trim().toLowerCase();
  circle.members.push({
    userId,
    email: normalized,
    role: 'member',
    collabEdit: false,
    joinedAt: new Date().toISOString(),
  });
  circle.pendingJoinRequests = circle.pendingJoinRequests.filter((r) => r.userId !== userId);
  await saveCircle(env, circle);

  const idx = await loadUserCirclesIndex(env, userId);
  if (!idx.memberOf.includes(circle.id)) idx.memberOf.push(circle.id);
  await saveUserCirclesIndex(env, userId, idx);
  return circle;
}

export async function listMyCircles(env: Env, userId: string): Promise<CircleSummary[]> {
  const idx = await loadUserCirclesIndex(env, userId);
  const ids = [...new Set([...idx.owned, ...idx.memberOf])];
  const out: CircleSummary[] = [];
  for (const id of ids) {
    const circle = await loadCircle(env, id);
    if (circle) out.push(summarize(circle, userId));
  }
  return out;
}

export async function listDiscoverableCircles(
  env: Env,
  userId: string,
): Promise<DiscoverableCircle[]> {
  await rebuildPublicCirclesIndex(env);
  const index = await loadPublicCirclesIndex(env);
  const out: DiscoverableCircle[] = [];
  for (const id of index.ids) {
    const circle = await loadCircle(env, id);
    if (!circle || circle.visibility !== 'public') continue;
    const ownerEmail = await getUserEmail(env, circle.ownerId);
    let myStatus: DiscoverableCircle['myStatus'] = 'none';
    if (circle.ownerId === userId) myStatus = 'owner';
    else if (isMember(circle, userId)) myStatus = 'member';
    else if (circle.pendingJoinRequests.some((r) => r.userId === userId)) myStatus = 'pending';
    out.push({
      id: circle.id,
      name: circle.name,
      description: circle.description ?? '',
      memberCount: circle.members.length,
      joinPolicy: circle.joinPolicy,
      ownerId: circle.ownerId,
      ownerEmail,
      myStatus,
    });
  }
  return out.sort((a, b) => b.memberCount - a.memberCount);
}

export async function listMyJoinRequests(env: Env, userId: string) {
  const index = await loadPublicCirclesIndex(env);
  const out: { circle: DiscoverableCircle; requestedAt: string }[] = [];
  for (const id of index.ids) {
    const circle = await loadCircle(env, id);
    if (!circle) continue;
    const req = circle.pendingJoinRequests.find((r) => r.userId === userId);
    if (!req) continue;
    const ownerEmail = await getUserEmail(env, circle.ownerId);
    out.push({
      circle: {
        id: circle.id,
        name: circle.name,
        description: circle.description ?? '',
        memberCount: circle.members.length,
        joinPolicy: circle.joinPolicy,
        ownerId: circle.ownerId,
        ownerEmail,
        myStatus: 'pending',
      },
      requestedAt: req.requestedAt,
    });
  }
  return out;
}

export async function createCircle(
  env: Env,
  ownerId: string,
  ownerEmail: string,
  name: string,
  opts?: {
    description?: string;
    visibility?: CircleVisibility;
    joinPolicy?: CircleJoinPolicy;
  },
): Promise<Circle> {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) throw new Error('name required');

  const now = new Date().toISOString();
  const id = `circle_${crypto.randomUUID()}`;
  const ownerMember: CircleMember = {
    userId: ownerId,
    email: ownerEmail,
    role: 'owner',
    collabEdit: true,
    joinedAt: now,
  };
  const circle: Circle = {
    schemaVersion: CIRCLE_SCHEMA_VERSION,
    id,
    name: trimmed,
    description: (opts?.description ?? '').trim().slice(0, 200),
    visibility: opts?.visibility ?? 'private',
    joinPolicy: opts?.joinPolicy ?? 'approval',
    ownerId,
    members: [ownerMember],
    pendingInvites: [],
    pendingJoinRequests: [],
    createdAt: now,
    updatedAt: now,
  };
  await saveCircle(env, circle);
  const idx = await loadUserCirclesIndex(env, ownerId);
  if (!idx.owned.includes(id)) idx.owned.push(id);
  await saveUserCirclesIndex(env, ownerId, idx);
  return circle;
}

export async function updateCircleSettings(
  env: Env,
  circleId: string,
  ownerId: string,
  patch: {
    name?: string;
    description?: string;
    visibility?: CircleVisibility;
    joinPolicy?: CircleJoinPolicy;
  },
): Promise<Circle> {
  const circle = await loadCircle(env, circleId);
  if (!circle) throw new Error('not found');
  if (circle.ownerId !== ownerId) throw new Error('forbidden');

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim().slice(0, 40);
    if (!trimmed) throw new Error('name required');
    circle.name = trimmed;
  }
  if (patch.description !== undefined) {
    circle.description = patch.description.trim().slice(0, 200);
  }
  if (patch.visibility !== undefined) circle.visibility = patch.visibility;
  if (patch.joinPolicy !== undefined) circle.joinPolicy = patch.joinPolicy;

  await saveCircle(env, circle);
  return circle;
}

export async function joinPublicCircle(
  env: Env,
  circleId: string,
  userId: string,
  email: string,
): Promise<Circle> {
  const circle = await loadCircle(env, circleId);
  if (!circle) throw new Error('not found');
  if (circle.visibility !== 'public') throw new Error('not public');
  if (circle.joinPolicy !== 'open') throw new Error('approval required');
  if (isMember(circle, userId)) return circle;
  return addMember(env, circle, userId, email);
}

export async function requestJoinCircle(
  env: Env,
  circleId: string,
  userId: string,
  email: string,
): Promise<Circle> {
  const circle = await loadCircle(env, circleId);
  if (!circle) throw new Error('not found');
  if (circle.visibility !== 'public') throw new Error('not public');
  if (circle.joinPolicy !== 'approval') throw new Error('open join');
  if (isMember(circle, userId)) return circle;
  if (circle.pendingJoinRequests.some((r) => r.userId === userId)) return circle;

  circle.pendingJoinRequests.push({
    userId,
    email: email.trim().toLowerCase(),
    requestedAt: new Date().toISOString(),
  });
  await saveCircle(env, circle);
  return circle;
}

export async function approveJoinRequest(
  env: Env,
  circleId: string,
  ownerId: string,
  targetUserId: string,
): Promise<Circle> {
  const circle = await loadCircle(env, circleId);
  if (!circle) throw new Error('not found');
  if (circle.ownerId !== ownerId) throw new Error('forbidden');
  const req = circle.pendingJoinRequests.find((r) => r.userId === targetUserId);
  if (!req) throw new Error('no request');
  return addMember(env, circle, targetUserId, req.email);
}

export async function rejectJoinRequest(
  env: Env,
  circleId: string,
  ownerId: string,
  targetUserId: string,
): Promise<Circle> {
  const circle = await loadCircle(env, circleId);
  if (!circle) throw new Error('not found');
  if (circle.ownerId !== ownerId) throw new Error('forbidden');
  circle.pendingJoinRequests = circle.pendingJoinRequests.filter(
    (r) => r.userId !== targetUserId,
  );
  await saveCircle(env, circle);
  return circle;
}

export async function inviteToCircle(
  env: Env,
  circleId: string,
  ownerId: string,
  email: string,
): Promise<Circle> {
  const circle = await loadCircle(env, circleId);
  if (!circle) throw new Error('not found');
  if (circle.ownerId !== ownerId) throw new Error('forbidden');
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) throw new Error('invalid email');
  if (circle.members.some((m) => m.email.toLowerCase() === normalized)) {
    throw new Error('already member');
  }
  if (circle.pendingInvites.some((i) => i.email.toLowerCase() === normalized)) {
    return circle;
  }
  circle.pendingInvites.push({
    email: normalized,
    invitedBy: ownerId,
    invitedAt: new Date().toISOString(),
  });
  await saveCircle(env, circle);
  return circle;
}

export async function listPendingInvites(env: Env, email: string) {
  const normalized = email.trim().toLowerCase();
  const { listDirectory } = await import('./github');
  const ids = await listDirectory(env, 'data/meta/circles');
  const out: { circle: CircleSummary; invitedAt: string }[] = [];
  for (const file of ids) {
    if (!file.endsWith('.json')) continue;
    const circleId = file.replace(/\.json$/, '');
    const circle = await loadCircle(env, circleId);
    if (!circle) continue;
    const inv = circle.pendingInvites.find((i) => i.email.toLowerCase() === normalized);
    if (inv) {
      out.push({
        circle: summarize(circle, ''),
        invitedAt: inv.invitedAt,
      });
    }
  }
  return out;
}

export async function acceptInvite(
  env: Env,
  circleId: string,
  userId: string,
  email: string,
): Promise<Circle> {
  const circle = await loadCircle(env, circleId);
  if (!circle) throw new Error('not found');
  const normalized = email.trim().toLowerCase();
  const invIdx = circle.pendingInvites.findIndex((i) => i.email.toLowerCase() === normalized);
  if (invIdx < 0) throw new Error('no invite');
  circle.pendingInvites.splice(invIdx, 1);
  await saveCircle(env, circle);
  return addMember(env, circle, userId, email);
}

export async function updateMyCollabEdit(
  env: Env,
  circleId: string,
  userId: string,
  collabEdit: boolean,
): Promise<Circle> {
  const circle = await loadCircle(env, circleId);
  if (!circle) throw new Error('not found');
  const member = circle.members.find((m) => m.userId === userId);
  if (!member) throw new Error('not member');
  if (member.role === 'owner') throw new Error('owner always editable');
  member.collabEdit = collabEdit;
  await saveCircle(env, circle);
  return circle;
}

export async function removeMember(
  env: Env,
  circleId: string,
  actorId: string,
  targetUserId: string,
): Promise<Circle> {
  const circle = await loadCircle(env, circleId);
  if (!circle) throw new Error('not found');
  const isOwner = circle.ownerId === actorId;
  if (targetUserId !== actorId && !isOwner) throw new Error('forbidden');
  if (targetUserId === circle.ownerId) throw new Error('cannot remove owner');

  circle.members = circle.members.filter((m) => m.userId !== targetUserId);
  await saveCircle(env, circle);

  const idx = await loadUserCirclesIndex(env, targetUserId);
  idx.memberOf = idx.memberOf.filter((id) => id !== circleId);
  await saveUserCirclesIndex(env, targetUserId, idx);
  return circle;
}

export async function getCircleFeed(env: Env, circleId: string, viewerId: string) {
  const circle = await loadCircle(env, circleId);
  if (!circle) throw new Error('not found');
  if (!isMember(circle, viewerId)) throw new Error('forbidden');

  const memberIds = circle.members.map((m) => m.userId);
  const feed = await buildCircleFeed(env, memberIds);
  return { circle: summarize(circle, viewerId), feed, members: circle.members };
}

export async function getCircleDetail(env: Env, circleId: string, viewerId: string) {
  const circle = await loadCircle(env, circleId);
  if (!circle) throw new Error('not found');
  if (!isMember(circle, viewerId)) throw new Error('forbidden');
  return circle;
}

export async function getCircleMemberBlogNote(
  env: Env,
  circleId: string,
  viewerId: string,
  ownerId: string,
  noteId: string,
) {
  const circle = await loadCircle(env, circleId);
  if (!circle) throw new Error('not found');
  if (!isMember(circle, viewerId)) throw new Error('forbidden');
  if (!circle.members.some((m) => m.userId === ownerId)) throw new Error('not member note');

  const note = await loadUserNote(env, ownerId, noteId);
  if (!note) throw new Error('not found');
  if (note.visibility !== 'public' && note.visibility !== 'circle') {
    throw new Error('not found');
  }
  const email = circle.members.find((m) => m.userId === ownerId)?.email ?? ownerId;
  return { note, ownerId, ownerEmail: email, circleId };
}

export async function assertCircleEditor(
  env: Env,
  circleId: string,
  userId: string,
): Promise<Circle> {
  const circle = await loadCircle(env, circleId);
  if (!circle) throw new Error('not found');
  if (!canEditCircleNotes(circle, userId)) throw new Error('forbidden');
  return circle;
}

export async function assertCircleMember(
  env: Env,
  circleId: string,
  userId: string,
): Promise<Circle> {
  const circle = await loadCircle(env, circleId);
  if (!circle) throw new Error('not found');
  if (!isMember(circle, userId)) throw new Error('forbidden');
  return circle;
}

/** 重建公开圈子索引（迁移用） */
export async function rebuildPublicCirclesIndex(env: Env) {
  const { listDirectory } = await import('./github');
  const files = await listDirectory(env, 'data/meta/circles');
  const ids: string[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const circle = await loadCircle(env, file.replace(/\.json$/, ''));
    if (circle?.visibility === 'public') ids.push(circle.id);
  }
  await savePublicCirclesIndex(env, { schemaVersion: 1, ids });
}
