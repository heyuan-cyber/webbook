import type { Env } from './env';
import { getFile, putFile, listDirectory } from './github';
import {
  LEGACY_TREE_PATH,
  USERS_INDEX_PATH,
  USER_TREE_PATH,
} from '@webbook/shared';

export interface UserIndexEntry {
  id: string;
  email: string;
  updatedAt: string;
  disabled?: boolean;
}

export interface UsersIndex {
  schemaVersion: number;
  users: UserIndexEntry[];
}

export async function loadUsersIndex(env: Env): Promise<UsersIndex> {
  const raw = await getFile(env, USERS_INDEX_PATH);
  if (!raw) return { schemaVersion: 1, users: [] };
  const data = JSON.parse(raw) as UsersIndex;
  return { schemaVersion: 1, users: Array.isArray(data.users) ? data.users : [] };
}

export async function saveUsersIndex(env: Env, index: UsersIndex): Promise<void> {
  await putFile(env, USERS_INDEX_PATH, JSON.stringify(index, null, 2), 'meta: users index');
}

/** 注册用户；已存在则更新 email / updatedAt */
export async function registerUser(env: Env, id: string, email: string): Promise<void> {
  const index = await loadUsersIndex(env);
  const now = new Date().toISOString();
  const existing = index.users.find((u) => u.id === id);
  if (existing) {
    existing.email = email;
    existing.updatedAt = now;
  } else {
    index.users.push({ id, email, updatedAt: now });
  }
  await saveUsersIndex(env, index);
}

/** 已知用户 + GitHub data/users 目录合并 */
export async function listKnownUserIds(env: Env): Promise<string[]> {
  const index = await loadUsersIndex(env);
  const fromIndex = index.users.map((u) => u.id);
  const fromDir = await listDirectory(env, 'data/users');
  const set = new Set([...fromIndex, ...fromDir]);
  return [...set];
}

export async function getUserEmail(env: Env, userId: string): Promise<string> {
  const index = await loadUsersIndex(env);
  return index.users.find((u) => u.id === userId)?.email ?? userId.slice(0, 8);
}

export async function isUserDisabled(env: Env, userId: string): Promise<boolean> {
  const index = await loadUsersIndex(env);
  return Boolean(index.users.find((u) => u.id === userId)?.disabled);
}

export async function setUserDisabled(
  env: Env,
  userId: string,
  disabled: boolean,
): Promise<UserIndexEntry | null> {
  const index = await loadUsersIndex(env);
  const entry = index.users.find((u) => u.id === userId);
  if (!entry) return null;
  entry.disabled = disabled;
  entry.updatedAt = new Date().toISOString();
  await saveUsersIndex(env, index);
  return entry;
}

/** 旧版单用户 tree 是否存在（用于迁移提示） */
export async function hasLegacyTree(env: Env): Promise<boolean> {
  const raw = await getFile(env, LEGACY_TREE_PATH);
  return Boolean(raw);
}

export function userTreePath(userId: string): string {
  return USER_TREE_PATH(userId);
}
