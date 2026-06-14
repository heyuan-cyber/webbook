import type { Env } from './env';
import { getFile, putFile } from './github';
import type {
  Circle,
  CircleMember,
  CircleShareStatus,
  CircleSummary,
} from '@webbook/shared';
import { CIRCLE_SCHEMA_VERSION, CIRCLE_PATH, USER_CIRCLES_INDEX_PATH } from '@webbook/shared';
import { buildCircleFeed } from './publicFeed';

interface UserCirclesIndex {
  schemaVersion: number;
  owned: string[];
  memberOf: string[];
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

export async function loadCircle(env: Env, circleId: string): Promise<Circle | null> {
  const raw = await getFile(env, CIRCLE_PATH(circleId));
  if (!raw) return null;
  return JSON.parse(raw) as Circle;
}

async function saveCircle(env: Env, circle: Circle): Promise<void> {
  circle.updatedAt = new Date().toISOString();
  await putFile(
    env,
    CIRCLE_PATH(circle.id),
    JSON.stringify(circle, null, 2),
    `circle: ${circle.name}`,
  );
}

function summarize(circle: Circle, userId: string): CircleSummary {
  const me = circle.members.find((m) => m.userId === userId);
  return {
    id: circle.id,
    name: circle.name,
    ownerId: circle.ownerId,
    memberCount: circle.members.length,
    myRole: me?.role,
    myShareStatus: me?.shareStatus,
  };
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

export async function createCircle(
  env: Env,
  ownerId: string,
  ownerEmail: string,
  name: string,
): Promise<Circle> {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) throw new Error('name required');

  const now = new Date().toISOString();
  const id = `circle_${crypto.randomUUID()}`;
  const ownerMember: CircleMember = {
    userId: ownerId,
    email: ownerEmail,
    role: 'owner',
    shareStatus: 'public_feed',
    joinedAt: now,
  };
  const circle: Circle = {
    schemaVersion: CIRCLE_SCHEMA_VERSION,
    id,
    name: trimmed,
    ownerId,
    members: [ownerMember],
    pendingInvites: [],
    createdAt: now,
    updatedAt: now,
  };
  await saveCircle(env, circle);
  const idx = await loadUserCirclesIndex(env, ownerId);
  if (!idx.owned.includes(id)) idx.owned.push(id);
  await saveUserCirclesIndex(env, ownerId, idx);
  return circle;
}

export function isMember(circle: Circle, userId: string): boolean {
  return circle.members.some((m) => m.userId === userId);
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
  if (isMember(circle, userId)) return circle;

  circle.pendingInvites.splice(invIdx, 1);
  circle.members.push({
    userId,
    email: normalized,
    role: 'member',
    shareStatus: 'public_feed',
    joinedAt: new Date().toISOString(),
  });
  await saveCircle(env, circle);

  const idx = await loadUserCirclesIndex(env, userId);
  if (!idx.memberOf.includes(circleId)) idx.memberOf.push(circleId);
  await saveUserCirclesIndex(env, userId, idx);
  return circle;
}

export async function updateMyShareStatus(
  env: Env,
  circleId: string,
  userId: string,
  shareStatus: CircleShareStatus,
): Promise<Circle> {
  const circle = await loadCircle(env, circleId);
  if (!circle) throw new Error('not found');
  const member = circle.members.find((m) => m.userId === userId);
  if (!member) throw new Error('not member');
  member.shareStatus = shareStatus;
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

  const shareMap = new Map<string, boolean>();
  for (const m of circle.members) {
    shareMap.set(m.userId, m.shareStatus === 'public_feed');
  }
  const memberIds = circle.members.map((m) => m.userId);
  const feed = await buildCircleFeed(env, memberIds, shareMap);
  return { circle: summarize(circle, viewerId), feed, members: circle.members };
}

export async function getCircleDetail(env: Env, circleId: string, viewerId: string) {
  const circle = await loadCircle(env, circleId);
  if (!circle) throw new Error('not found');
  if (!isMember(circle, viewerId)) throw new Error('forbidden');
  return circle;
}
