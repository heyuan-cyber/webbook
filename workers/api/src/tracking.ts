import type { Env } from './env';
import { getFile, putFile, deleteFile, listDirectory } from './github';
import type {
  Expense,
  ExpenseCategory,
  ExpenseMonth,
  ExpenseRules,
  ExpenseSource,
  UsageDay,
} from '@webbook/shared';
import {
  EXPENSE_CATEGORIES,
  USER_EXPENSES_MONTH_PATH,
  USER_EXPENSE_RULES_PATH,
  USER_USAGE_DAY_PATH,
  createEmptyExpenseMonth,
  createEmptyExpenseRules,
  isExpenseCategory,
  isValidExpenseMonth,
  isValidUsageDate,
  mergeExpenses,
  normalizeExpense,
  normalizeExpenseMonth,
  normalizeExpenseRules,
  normalizeMerchant,
  normalizeUsageDay,
  summarizeExpenses,
} from '@webbook/shared';
import { chat } from './ai';

/**
 * 手机采集数据的持久化（native-android-companion 的 tasks 4.1 / 4.2）。
 *
 * ## 为什么分片 + 批量
 *
 * 唯一持久层是 GitHub Contents API：逐文件读改写，且**每次写入产生一个 commit**。
 * 若逐笔消费各写一次，一个月几百次 commit 会把 git 历史变成噪声，也会撞上
 * `github.ts` 的串行写队列。因此：
 *   - 使用统计：一天一个分片（新增一天不触碰既有分片）
 *   - 消费：一个月一个分片 + 手机端攒批，服务端一次 merge 只落一次盘
 *
 * ## 幂等来自两侧
 *
 * `normalizeUsageDay` 与 `mergeExpenses` 都在 `packages/shared`，Worker 与断言脚本
 * 跑同一份实现，所以幂等语义有真实覆盖而不只是"读过一遍代码"。
 */

/* ────────────────────────── 使用统计 ────────────────────────── */

export async function loadUsageDay(env: Env, userId: string, date: string): Promise<UsageDay | null> {
  if (!isValidUsageDate(date)) return null;
  const raw = await getFile(env, USER_USAGE_DAY_PATH(userId, date));
  if (!raw) return null;
  try {
    return normalizeUsageDay(JSON.parse(raw) as Partial<UsageDay>);
  } catch {
    // 单个分片损坏不应让整个统计不可用
    return null;
  }
}

/**
 * 写入若干天的使用统计。**以「用户 + 日期」为幂等键**：同日期重复上报覆盖既有内容。
 *
 * @returns 实际写入的日期列表（非法日期被跳过）
 */
export async function saveUsageDays(
  env: Env,
  userId: string,
  days: unknown[],
): Promise<string[]> {
  const written: string[] = [];
  for (const item of Array.isArray(days) ? days : []) {
    const day = normalizeUsageDay((item ?? {}) as Partial<UsageDay>);
    // 丢弃日期非法或没有任何应用数据的条目——不产生"零值日期记录"，
    // 否则界面会把"没采集"误当成"当天没用手机"（spec 明确禁止）
    if (!day.date || day.apps.length === 0) continue;
    await putFile(
      env,
      USER_USAGE_DAY_PATH(userId, day.date),
      JSON.stringify(day, null, 2),
      `usage: ${day.date}`,
    );
    written.push(day.date);
  }
  return written;
}

/** 读取一段区间内的使用统计（按日期升序）。缺失的日期不出现在结果中 */
export async function loadUsageRange(
  env: Env,
  userId: string,
  from: string,
  to: string,
): Promise<UsageDay[]> {
  const dates = enumerateDates(from, to);
  const out: UsageDay[] = [];
  for (const date of dates) {
    const day = await loadUsageDay(env, userId, date);
    if (day) out.push(day);
  }
  return out;
}

/** 列出该用户已有哪些日期的使用数据（升序） */
export async function listUsageDates(env: Env, userId: string): Promise<string[]> {
  const names = await listDirectory(env, `data/users/${userId}/usage`);
  return names
    .map((n) => n.replace(/\.json$/, ''))
    .filter(isValidUsageDate)
    .sort();
}

/** 删除某一天或一段区间的使用数据 */
export async function deleteUsageRange(
  env: Env,
  userId: string,
  from: string,
  to: string,
): Promise<number> {
  const dates = enumerateDates(from, to);
  let n = 0;
  for (const date of dates) {
    if (!isValidUsageDate(date)) continue;
    const existing = await loadUsageDay(env, userId, date);
    if (!existing) continue;
    await deleteFile(env, USER_USAGE_DAY_PATH(userId, date), `usage: delete ${date}`);
    n++;
  }
  return n;
}

/** 把 `[from, to]` 展开为日期串列表；上限保护避免超大区间 */
function enumerateDates(from: string, to: string): string[] {
  if (!isValidUsageDate(from) || !isValidUsageDate(to)) return [];
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (cursor > end) return [];
  const MAX = 400;
  while (cursor <= end && out.length < MAX) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/* ────────────────────────── 消费记录 ────────────────────────── */

export async function loadExpenseMonth(
  env: Env,
  userId: string,
  month: string,
): Promise<ExpenseMonth> {
  if (!isValidExpenseMonth(month)) return createEmptyExpenseMonth('');
  const raw = await getFile(env, USER_EXPENSES_MONTH_PATH(userId, month));
  if (!raw) return createEmptyExpenseMonth(month);
  try {
    return normalizeExpenseMonth(JSON.parse(raw) as Partial<ExpenseMonth>);
  } catch {
    return createEmptyExpenseMonth(month);
  }
}

export async function loadExpenseRules(env: Env, userId: string): Promise<ExpenseRules> {
  const raw = await getFile(env, USER_EXPENSE_RULES_PATH(userId));
  if (!raw) return createEmptyExpenseRules();
  try {
    return normalizeExpenseRules(JSON.parse(raw) as Partial<ExpenseRules>);
  } catch {
    return createEmptyExpenseRules();
  }
}

export async function saveExpenseRules(
  env: Env,
  userId: string,
  rules: ExpenseRules,
): Promise<void> {
  await putFile(
    env,
    USER_EXPENSE_RULES_PATH(userId),
    JSON.stringify(normalizeExpenseRules(rules), null, 2),
    'expenses: rules',
  );
}

/** 批量提交的结果 */
export interface BulkExpenseResult {
  /** 实际新增的记录数（去重后） */
  added: number;
  /** 因重复而被并入既有记录的条数 */
  merged: number;
  /** 结构不合法被丢弃的条数 */
  rejected: number;
  /** 受影响的月份 */
  months: string[];
  /** 本次经规则归类成功的条数 */
  classifiedByRule: number;
  /** 本次经模型推断成功的条数 */
  classifiedByAi: number;
  /** 归入「未分类」的条数（模型不可用或推断失败） */
  unclassified: number;
}

/**
 * 用一个商户名定类别：先查规则，未命中才调模型，成功后把结果写回规则。
 *
 * 这是设计 D7 的落点：**模型只对每个新商户调用一次，之后是确定性规则命中**。
 * 既省钱（DeepSeek 按量计费）又稳定——同一商户不会因模型波动而反复变类。
 *
 * 失败一律归入「未分类」而不是猜：类别是统计维度，猜错会污染整个占比。
 */
async function classifyMerchant(
  env: Env,
  merchant: string,
  rules: ExpenseRules,
  cache: Map<string, ExpenseCategory>,
): Promise<{ category: ExpenseCategory; byAi: boolean }> {
  const key = normalizeMerchant(merchant);
  if (!key) return { category: 'uncategorized', byAi: false };

  // 批内缓存：同一批次里同一商户只调一次模型
  const cached = cache.get(key);
  if (cached) return { category: cached, byAi: false };

  const rule = rules.rules[key];
  if (rule) {
    cache.set(key, rule);
    return { category: rule, byAi: false };
  }

  try {
    const list = EXPENSE_CATEGORIES.filter((c) => c !== 'uncategorized').join(', ');
    const answer = await chat(
      env,
      `你是消费记账的归类助手。只能从以下类别中选一个：${list}。` +
        `只输出类别英文名，不要任何其他文字或标点。无法判断时输出 other。`,
      `商户名：${key}`,
    );
    const picked = answer.trim().toLowerCase().replace(/[^a-z_]/g, '');
    const category: ExpenseCategory =
      isExpenseCategory(picked) && picked !== 'uncategorized' ? picked : 'other';
    rules.rules[key] = category;
    cache.set(key, category);
    return { category, byAi: true };
  } catch {
    // 模型不可用：归入未分类，仍计入总额且可由用户手工归类
    return { category: 'uncategorized', byAi: false };
  }
}

/**
 * 批量提交消费记录。
 *
 * 两个关键点：
 *   1. **按月份分组后每月份只落一次盘**——这是"一次 merge + 一次持久化"的落点，
 *      也是避免逐笔 commit 的地方
 *   2. **归类在服务端完成**（tasks 9.6）——规则文件在数据仓里、AI 密钥是 Worker
 *      secret，放前端既拿不到密钥也保证不了一致性；前端只交出金额/商户/时刻
 */
export async function saveExpensesBulk(
  env: Env,
  userId: string,
  incoming: unknown[],
): Promise<BulkExpenseResult> {
  const byMonth = new Map<string, Expense[]>();
  let rejected = 0;

  for (const item of Array.isArray(incoming) ? incoming : []) {
    const e = normalizeExpense((item ?? {}) as Partial<Expense>);
    if (!e) {
      rejected++;
      continue;
    }
    const month = e.postedAt.slice(0, 7);
    if (!isValidExpenseMonth(month)) {
      rejected++;
      continue;
    }
    const list = byMonth.get(month) ?? [];
    list.push(e);
    byMonth.set(month, list);
  }

  let added = 0;
  let merged = 0;
  let classifiedByRule = 0;
  let classifiedByAi = 0;
  let unclassified = 0;
  const months: string[] = [];

  const rules = await loadExpenseRules(env, userId);
  const rulesBefore = JSON.stringify(rules.rules);
  const cache = new Map<string, ExpenseCategory>();

  for (const [month, batch] of byMonth) {
    const existing = await loadExpenseMonth(env, userId, month);
    const before = new Set(existing.expenses.map((e) => e.dedupeKey));

    // 只对"未分类且未被用户手工钉住"的做归类
    const classified: Expense[] = [];
    for (const e of batch) {
      if (e.category !== 'uncategorized' || e.categoryPinned) {
        classified.push(e);
        continue;
      }
      const r = await classifyMerchant(env, e.merchant, rules, cache);
      classified.push({ ...e, category: r.category });
      if (r.category === 'uncategorized') unclassified++;
      else if (r.byAi) classifiedByAi++;
      else classifiedByRule++;
    }

    const next = mergeExpenses(existing.expenses, classified);

    merged += batch.filter((e) => before.has(e.dedupeKey)).length;
    added += batch.filter((e) => !before.has(e.dedupeKey)).length;

    await putFile(
      env,
      USER_EXPENSES_MONTH_PATH(userId, month),
      JSON.stringify({ schemaVersion: existing.schemaVersion, month, expenses: next }, null, 2),
      `expenses: ${month}`,
    );
    months.push(month);
  }

  // 只有真的学到新规则才写回，避免无谓的 commit
  if (JSON.stringify(rules.rules) !== rulesBefore) {
    await saveExpenseRules(env, userId, rules);
  }

  months.sort();
  return {
    added,
    merged,
    rejected,
    months,
    classifiedByRule,
    classifiedByAi,
    unclassified,
  };
}

/**
 * 修正一条记录的类别，并把「商户 → 类别」沉淀为规则。
 *
 * 沉淀规则是刻意的：用户手工改正后，同一商户后续的消费应直接采用修正后的类别，
 * 不再走模型推断（spec 的「修正沉淀为规则」）。
 */
export async function updateExpenseCategory(
  env: Env,
  userId: string,
  expenseId: string,
  category: ExpenseCategory,
): Promise<Expense | null> {
  const month = await findExpenseMonth(env, userId, expenseId);
  if (!month) return null;
  const doc = await loadExpenseMonth(env, userId, month);
  const target = doc.expenses.find((e) => e.id === expenseId);
  if (!target) return null;

  const updated: Expense = { ...target, category, categoryPinned: true };
  const expenses = doc.expenses.map((e) => (e.id === expenseId ? updated : e));
  await putFile(
    env,
    USER_EXPENSES_MONTH_PATH(userId, month),
    JSON.stringify({ schemaVersion: doc.schemaVersion, month, expenses }, null, 2),
    `expenses: recategorize ${expenseId}`,
  );

  if (updated.merchant) {
    const rules = await loadExpenseRules(env, userId);
    await saveExpenseRules(env, userId, {
      ...rules,
      rules: { ...rules.rules, [normalizeMerchant(updated.merchant)]: category },
    });
  }
  return updated;
}

/** 删除一条误记。返回被删除的记录；不存在时 null */
export async function deleteExpense(
  env: Env,
  userId: string,
  expenseId: string,
): Promise<Expense | null> {
  const month = await findExpenseMonth(env, userId, expenseId);
  if (!month) return null;
  const doc = await loadExpenseMonth(env, userId, month);
  const target = doc.expenses.find((e) => e.id === expenseId);
  if (!target) return null;

  const expenses = doc.expenses.filter((e) => e.id !== expenseId);
  const path = USER_EXPENSES_MONTH_PATH(userId, month);
  if (expenses.length === 0) {
    // 空月份直接删文件，不留空壳分片
    await deleteFile(env, path, `expenses: delete empty ${month}`);
  } else {
    await putFile(
      env,
      path,
      JSON.stringify({ schemaVersion: doc.schemaVersion, month, expenses }, null, 2),
      `expenses: delete ${expenseId}`,
    );
  }
  return target;
}

/** 按 id 定位所属月份。只查最近若干个月，避免遍历全部历史 */
async function findExpenseMonth(
  env: Env,
  userId: string,
  expenseId: string,
  lookbackMonths = 24,
): Promise<string | null> {
  const now = new Date();
  for (let i = 0; i < lookbackMonths; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const month = d.toISOString().slice(0, 7);
    const doc = await loadExpenseMonth(env, userId, month);
    if (doc.expenses.some((e) => e.id === expenseId)) return month;
  }
  return null;
}

/** 月度汇总 + 明细，供 Web 端账单页一次取全 */
export async function loadExpenseOverview(
  env: Env,
  userId: string,
  month: string,
): Promise<{ month: string; summary: ReturnType<typeof summarizeExpenses>; expenses: Expense[]; rules: ExpenseRules }> {
  const doc = await loadExpenseMonth(env, userId, month);
  const rules = await loadExpenseRules(env, userId);
  return {
    month: doc.month,
    summary: summarizeExpenses(month, doc.expenses),
    expenses: doc.expenses,
    rules,
  };
}

/** 供未来 AI 分类使用：某商户是否已有规则 */
export async function lookupExpenseRule(
  env: Env,
  userId: string,
  merchant: string,
): Promise<ExpenseCategory | null> {
  const rules = await loadExpenseRules(env, userId);
  return rules.rules[normalizeMerchant(merchant)] ?? null;
}

export type { ExpenseSource };
