import type { Env } from './env';
import { getFile, getFileSha, putFile, putFileConditional } from './github';
import type { LegacyReminder, PlanDoc } from '@webbook/shared';
import {
  USER_PLAN_PATH,
  USER_REMINDERS_PATH,
  createEmptyPlan,
  mergeReminders,
  normalizePlan,
} from '@webbook/shared';

/**
 * 任务规划的单文件持久化（design D1/D2）。
 *
 * 整棵树存一个 plan.json：父栏目要聚合到最深后代，分片方案会让打开一个深层栏目变成
 * N 次 Contents API 请求，延迟随层级线性增长。代价是所有写入都提交整份文档，
 * 因此必须靠 baseSha 乐观锁避免静默覆盖。
 */

export interface LoadedPlan {
  plan: PlanDoc;
  /** 文件当前 revision；不存在为 null。客户端下次写入必须带回。 */
  baseSha: string | null;
}

export async function loadUserPlan(env: Env, userId: string): Promise<PlanDoc> {
  return (await loadUserPlanWithSha(env, userId)).plan;
}

export async function loadUserPlanWithSha(env: Env, userId: string): Promise<LoadedPlan> {
  const path = USER_PLAN_PATH(userId);
  const [raw, sha] = await Promise.all([getFile(env, path), getFileSha(env, path)]);
  if (!raw) return { plan: createEmptyPlan(), baseSha: sha };
  try {
    return { plan: normalizePlan(JSON.parse(raw)), baseSha: sha };
  } catch {
    // 文件损坏不应让整个规划不可用：按空计划起步，写回时靠 baseSha 覆盖
    return { plan: createEmptyPlan(), baseSha: sha };
  }
}

/**
 * 写入规划。`baseSha` 为 undefined 时走无条件写入（仅迁移/修复场景）。
 * @throws FileConflictError 当 baseSha 已过期——调用方应转成 409，不要重试
 */
export async function saveUserPlan(
  env: Env,
  userId: string,
  plan: PlanDoc,
  baseSha: string | null | undefined,
): Promise<string | null> {
  const path = USER_PLAN_PATH(userId);
  const body = JSON.stringify(plan, null, 2);
  const message = 'plan: update';
  if (baseSha === undefined) {
    await putFile(env, path, body, message);
    return getFileSha(env, path);
  }
  return putFileConditional(env, path, body, message, baseSha);
}

/* ────────────────────────── 旧 reminders 一次性迁移 ────────────────────────── */

/**
 * 把旧 reminders.json 并入规划（design D8）。
 *
 * 断言脚本与 Worker 跑同一份 `mergeReminders` 实现（见 packages/shared/src/plan.ts），
 * 所以迁移语义有真实覆盖，而不只是"读过一遍代码"。
 */
export async function migrateRemindersIntoPlan(
  env: Env,
  userId: string,
  loaded: LoadedPlan,
): Promise<LoadedPlan> {
  if (loaded.plan.migratedReminders) return loaded;

  const raw = await getFile(env, USER_REMINDERS_PATH(userId));
  let reminders: LegacyReminder[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { reminders?: LegacyReminder[] };
      if (Array.isArray(parsed.reminders)) reminders = parsed.reminders;
    } catch {
      reminders = [];
    }
  }

  const { plan } = mergeReminders(loaded.plan, reminders);
  // 没有 reminders 也要落盘：否则每次 GET 都会重读一次旧文件
  const baseSha = await saveUserPlan(env, userId, plan, loaded.baseSha);
  return { plan, baseSha };
}
