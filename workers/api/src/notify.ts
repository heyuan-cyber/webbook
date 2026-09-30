import type { Env } from './env';
import { getFile, putFile } from './github';
import type { NotifyIndex, NotifyItem, NotifyRepeat } from '@webbook/shared';
import {
  USER_NOTIFY_PATH,
  createEmptyNotifyIndex,
  expandNotifyInstances,
  isDeliverable,
  normalizeNotifyIndex,
  normalizeNotifyItem,
} from '@webbook/shared';

/**
 * 到点提醒的持久化（native-android-companion 的 tasks 4.9 / 4.10 / 4.11）。
 *
 * ## 为什么是独立文件
 *
 * 存 `data/users/{userId}/notify.json`，**不碰 `reminders.json`**。
 * 后者归 `webbook-node-planner` 的规划迁移所有，其 `mergeReminders` 会把
 * 「有 id 且有 text」的条目永久并入 `plan.json`。共用文件会让本模型的新提醒
 * 被静默吞成规划任务，且因为迁移标记会被写死而**不可逆**。详见 design.md 的 D8。
 *
 * ## 单文件 vs 分片
 *
 * 提醒总量天然很小（个人几十条），且 CRUD 需要整体一致性，因此单文件。
 * 代价是每次写入提交整份文档；提醒是低频写入，可接受。
 */

export async function loadNotifyIndex(env: Env, userId: string): Promise<NotifyIndex> {
  const raw = await getFile(env, USER_NOTIFY_PATH(userId));
  if (!raw) return createEmptyNotifyIndex();
  try {
    return normalizeNotifyIndex(JSON.parse(raw) as Partial<NotifyIndex>);
  } catch {
    // 文件损坏不应让提醒整体不可用
    return createEmptyNotifyIndex();
  }
}

export async function saveNotifyIndex(
  env: Env,
  userId: string,
  index: NotifyIndex,
): Promise<void> {
  await putFile(
    env,
    USER_NOTIFY_PATH(userId),
    JSON.stringify(normalizeNotifyIndex(index), null, 2),
    'notify: update',
  );
}

/** 创建一条提醒所需的输入 */
export interface CreateNotifyInput {
  title: string;
  body?: string;
  dueAt?: string;
  repeat?: NotifyRepeat;
  source?: NotifyItem['source'];
}

export async function createNotifyItem(
  env: Env,
  userId: string,
  input: CreateNotifyInput,
): Promise<NotifyItem | null> {
  const now = new Date().toISOString();
  const item = normalizeNotifyItem({
    id: crypto.randomUUID(),
    title: input.title,
    body: input.body,
    dueAt: input.dueAt,
    repeat: input.repeat,
    source: input.source ?? 'manual',
    done: false,
    createdAt: now,
    updatedAt: now,
  });
  if (!item) return null;
  const index = await loadNotifyIndex(env, userId);
  await saveNotifyIndex(env, userId, { ...index, items: [...index.items, item] });
  return item;
}

/**
 * 修改一条提醒。
 *
 * 只允许白名单字段——避免调用方把 `id` / `createdAt` 覆盖掉。
 * `dueAt` 显式传 `null` 表示清除触发时刻（降级为"仅记录、不定时"，spec 允许该形态）。
 */
export interface PatchNotifyInput {
  title?: string;
  body?: string;
  dueAt?: string | null;
  repeat?: NotifyRepeat;
  done?: boolean;
  notifiedAt?: string | null;
}

export async function patchNotifyItem(
  env: Env,
  userId: string,
  id: string,
  patch: PatchNotifyInput,
): Promise<NotifyItem | null> {
  const index = await loadNotifyIndex(env, userId);
  const prev = index.items.find((i) => i.id === id);
  if (!prev) return null;

  const updatedAt = new Date().toISOString();

  // dueAt / notifiedAt 用显式 null 表示清除；undefined 表示不改动
  const dueAt = patch.dueAt === null ? undefined : (patch.dueAt ?? prev.dueAt);
  const notifiedAt =
    patch.notifiedAt === null ? undefined : (patch.notifiedAt ?? prev.notifiedAt);

  const next = normalizeNotifyItem({
    id: prev.id,
    title: patch.title ?? prev.title,
    body: patch.body ?? prev.body,
    repeat: patch.repeat ?? prev.repeat,
    done: patch.done ?? prev.done,
    source: prev.source,
    createdAt: prev.createdAt,
    updatedAt,
    ...(dueAt !== undefined ? { dueAt } : {}),
    ...(notifiedAt !== undefined ? { notifiedAt } : {}),
  });
  if (!next) return null;

  await saveNotifyIndex(env, userId, {
    ...index,
    items: index.items.map((i) => (i.id === id ? next : i)),
  });
  return next;
}

export async function deleteNotifyItem(
  env: Env,
  userId: string,
  id: string,
): Promise<boolean> {
  const index = await loadNotifyIndex(env, userId);
  if (!index.items.some((i) => i.id === id)) return false;
  await saveNotifyIndex(env, userId, {
    ...index,
    items: index.items.filter((i) => i.id !== id),
  });
  return true;
}

/** 手机拉取待触发提醒时返回的一个具体实例 */
export interface DueInstance {
  /** 提醒 id */
  id: string;
  /** 该实例的触发时刻 */
  dueAt: string;
  title: string;
  body: string;
}

export interface DueResult {
  /** 窗口内将触发的实例，按时刻升序 */
  due: DueInstance[];
  /** 已过期但从未送达的提醒，供界面呈现"错过"——不补发通知 */
  missed: DueInstance[];
  /** 窗口与生成时刻，便于客户端判断新鲜度 */
  window: { from: string; to: string; generatedAt: string };
}

/**
 * 拉取一段时间窗口内将触发的提醒实例（tasks 4.10）。
 *
 * 语义要点：
 *   - 重复规则在服务端展开为**具体实例**，手机端只负责排程，不重复实现重复语义
 *   - 只返回属于当前用户的提醒（调用方保证 userId 来自 JWT，不来自请求体）
 *   - `missed` 与 `due` 分开：前者是"已经错过、不补发"，后者是"未来要排的"
 *   - 已完成的提醒不进入任一列表
 */
export async function getDueInstances(
  env: Env,
  userId: string,
  windowDays: number,
  now: Date = new Date(),
): Promise<DueResult> {
  const index = await loadNotifyIndex(env, userId);
  const from = now;
  const to = new Date(now.getTime() + windowDays * 86_400_000);

  const due: DueInstance[] = [];
  const missed: DueInstance[] = [];

  for (const item of index.items) {
    if (!isDeliverable(item) || !item.dueAt) continue;

    for (const at of expandNotifyInstances(item, from, to)) {
      due.push({ id: item.id, dueAt: at, title: item.title, body: item.body });
    }

    // 过期且从未送达：单独列出。不进入 due，因此不会被排程、不会补发通知。
    if (new Date(item.dueAt) < from && !item.notifiedAt) {
      missed.push({ id: item.id, dueAt: item.dueAt, title: item.title, body: item.body });
    }
  }

  due.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  missed.sort((a, b) => b.dueAt.localeCompare(a.dueAt));

  return {
    due,
    missed,
    window: { from: from.toISOString(), to: to.toISOString(), generatedAt: now.toISOString() },
  };
}

/**
 * 标记送达（tasks 4.11 的"已排程 vs 已送达"）。
 *
 * 只有**未送达**时才写入，这样重复调用是幂等的，也不会把后续触发的送达时刻
 * 覆盖成旧值。
 *
 * 命名带 Notify 前缀是刻意的：`reminders.ts` 已下线，但"标记已通知"是个通用词，
 * 显式限定可避免将来与别的模块重名。
 */
export async function markNotifyDelivered(
  env: Env,
  userId: string,
  id: string,
  at: string = new Date().toISOString(),
): Promise<NotifyItem | null> {
  const index = await loadNotifyIndex(env, userId);
  const prev = index.items.find((i) => i.id === id);
  if (!prev) return null;
  if (prev.notifiedAt) return prev;

  const next = normalizeNotifyItem({ ...prev, notifiedAt: at, updatedAt: at });
  if (!next) return null;
  await saveNotifyIndex(env, userId, {
    ...index,
    items: index.items.map((i) => (i.id === id ? next : i)),
  });
  return next;
}
