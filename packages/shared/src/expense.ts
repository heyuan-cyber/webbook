/**
 * 消费记账数据模型（native-android-companion 的 `mobile-expense-tracking`）。
 *
 * 存储形状：
 *   `data/users/{userId}/expenses/{YYYY-MM}.json`  按月分片
 *   `data/users/{userId}/expenses/rules.json`      商户 → 类别 规则
 *
 * 为什么按月分片 + 批量写入：唯一持久层是 GitHub Contents API（逐文件、每次都产生一次
 * commit）。逐笔支付各写一次会把 git 历史变成噪声，也会撞上串行写队列。手机端先攒批、
 * 服务端一次 merge，把写入压到每天几次量级。详见 design.md 的 D6。
 */

export const EXPENSE_SCHEMA_VERSION = 1;

/** 来源渠道：仅支持已声明的两种，其他一律不进入解析流程 */
export type ExpenseSource = 'wechat' | 'alipay';

/**
 * 消费类别：**有限集合**。
 *
 * spec 要求"不存在集合之外的类别值"，因此模型推断的输出也受此约束——
 * 这是把 AI 的自由文本收敛成可统计维度的关键。
 */
export const EXPENSE_CATEGORIES = [
  'food', // 餐饮
  'transport', // 交通
  'shopping', // 购物
  'housing', // 居住
  'medical', // 医疗
  'entertainment', // 娱乐
  'social', // 人情
  'education', // 教育
  'other', // 其他
  'uncategorized', // 未分类：AI 不可用时的落点，仍计入总额且可手工归类
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** 类别的中文显示名 */
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: '餐饮',
  transport: '交通',
  shopping: '购物',
  housing: '居住',
  medical: '医疗',
  entertainment: '娱乐',
  social: '人情',
  education: '教育',
  other: '其他',
  uncategorized: '未分类',
};

export function isExpenseCategory(v: unknown): v is ExpenseCategory {
  return typeof v === 'string' && (EXPENSE_CATEGORIES as readonly string[]).includes(v);
}

/** 一条消费记录 */
export interface Expense {
  id: string;
  /**
   * 金额，**以分为单位的整数**。
   * 用整数是为了避免浮点误差累加到月度合计上（0.1 + 0.2 问题）。
   */
  amountCents: number;
  /** 商户名，做过去空白与长度归一 */
  merchant: string;
  /** 发生时刻（ISO 8601） */
  postedAt: string;
  source: ExpenseSource;
  category: ExpenseCategory;
  /**
   * 幂等键：同一笔真实消费的重复通知必须收敛成一条。
   * 计算方式见 `computeDedupeKey`。
   */
  dedupeKey: string;
  /**
   * 是否由用户手工修正过类别。
   * 用于避免后续自动分类覆盖人工判断。
   */
  categoryPinned?: boolean;
  /** 该条源自无法解析的通知，保留供用户查看与人工修正 */
  unparsed?: boolean;
}

/** 一个自然月的消费分片 */
export interface ExpenseMonth {
  schemaVersion: number;
  /** `YYYY-MM` */
  month: string;
  expenses: Expense[];
}

/** 分类规则文件 */
export interface ExpenseRules {
  schemaVersion: number;
  /** 商户 → 类别。键为归一化后的商户名 */
  rules: Record<string, ExpenseCategory>;
}

export function createEmptyExpenseMonth(month: string): ExpenseMonth {
  return { schemaVersion: EXPENSE_SCHEMA_VERSION, month, expenses: [] };
}

export function createEmptyExpenseRules(): ExpenseRules {
  return { schemaVersion: EXPENSE_SCHEMA_VERSION, rules: {} };
}

/* ────────────────────────── 归一化与幂等 ────────────────────────── */

const MONTH_RE = /^\d{4}-\d{2}$/;

export function isValidExpenseMonth(month: string): boolean {
  return MONTH_RE.test(month);
}

/** 商户名归一化：去首尾空白、压缩内部空白、截断过长值。用于规则匹配与幂等键 */
export function normalizeMerchant(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 60);
}

/**
 * 计算幂等键。
 *
 * 关键设计：`postedAt` **按分钟归桶**。
 * 同一笔支付可能产生多条措辞不同、时间戳相差几秒的通知；按分钟归桶能让它们收敛，
 * 而"金额与商户相同但时刻明显不同"的两笔真实消费仍会得到不同的键（对应 spec
 * 的「金额相同但确属两笔」场景）。
 *
 * 这里用简单的字符串拼接再做 djb2 散列，而不是 crypto：本函数同时被 Worker 与
 * 前端调用，且 publish 到 `packages/shared` 的代码应保持无运行时依赖。
 */
export function computeDedupeKey(input: {
  source: ExpenseSource;
  amountCents: number;
  merchant: string;
  postedAt: string;
}): string {
  const minuteBucket = input.postedAt.slice(0, 16); // YYYY-MM-DDTHH:mm
  const material = [
    input.source,
    String(input.amountCents),
    normalizeMerchant(input.merchant),
    minuteBucket,
  ].join('\u0001');
  return `exp_${djb2(material)}`;
}

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function toAmountCents(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

/** 归一化单条记录；结构不可用的返回 null 由调用方丢弃 */
export function normalizeExpense(raw: Partial<Expense>): Expense | null {
  const amountCents = toAmountCents(raw.amountCents);
  if (!raw.id || amountCents <= 0) return null;
  if (raw.source !== 'wechat' && raw.source !== 'alipay') return null;
  const postedAt = typeof raw.postedAt === 'string' ? raw.postedAt : '';
  if (!postedAt) return null;
  const merchant = normalizeMerchant(typeof raw.merchant === 'string' ? raw.merchant : '');
  const category: ExpenseCategory = isExpenseCategory(raw.category)
    ? raw.category
    : 'uncategorized';
  return {
    id: raw.id,
    amountCents,
    merchant,
    postedAt,
    source: raw.source,
    category,
    dedupeKey:
      typeof raw.dedupeKey === 'string' && raw.dedupeKey
        ? raw.dedupeKey
        : computeDedupeKey({ source: raw.source, amountCents, merchant, postedAt }),
    ...(raw.categoryPinned === true ? { categoryPinned: true } : {}),
    ...(raw.unparsed === true ? { unparsed: true } : {}),
  };
}

/**
 * 按 `dedupeKey` 合并记录：后到的覆盖先到的（保留 id 与人工修正过的类别）。
 *
 * 这是"重复上报不产生两条记录"的唯一实现点，Worker 与前端共用。
 */
export function mergeExpenses(existing: Expense[], incoming: Expense[]): Expense[] {
  const byKey = new Map<string, Expense>();
  for (const e of existing) byKey.set(e.dedupeKey, e);
  for (const e of incoming) {
    const prev = byKey.get(e.dedupeKey);
    if (!prev) {
      byKey.set(e.dedupeKey, e);
      continue;
    }
    // 人工修正优先：不被后续自动分类覆盖
    const category = prev.categoryPinned ? prev.category : e.category;
    byKey.set(e.dedupeKey, {
      ...e,
      id: prev.id,
      category,
      ...(prev.categoryPinned ? { categoryPinned: true } : {}),
    });
  }
  return [...byKey.values()].sort((a, b) => a.postedAt.localeCompare(b.postedAt));
}

/** 月度分片归一化 */
export function normalizeExpenseMonth(raw: Partial<ExpenseMonth> & { month?: string }): ExpenseMonth {
  const month = typeof raw.month === 'string' && isValidExpenseMonth(raw.month) ? raw.month : '';
  const expenses: Expense[] = [];
  for (const item of Array.isArray(raw.expenses) ? raw.expenses : []) {
    const n = normalizeExpense(item ?? {});
    if (n) expenses.push(n);
  }
  return {
    schemaVersion: EXPENSE_SCHEMA_VERSION,
    month,
    expenses: mergeExpenses([], expenses),
  };
}

/** 分类规则归一化：丢弃非法类别值 */
export function normalizeExpenseRules(raw: Partial<ExpenseRules>): ExpenseRules {
  const rules: Record<string, ExpenseCategory> = {};
  const src = raw.rules && typeof raw.rules === 'object' ? raw.rules : {};
  for (const [k, v] of Object.entries(src)) {
    const key = normalizeMerchant(k);
    if (key && isExpenseCategory(v)) rules[key] = v;
  }
  return { schemaVersion: EXPENSE_SCHEMA_VERSION, rules };
}

/* ────────────────────────── 汇总 ────────────────────────── */

export interface ExpenseCategoryTotal {
  category: ExpenseCategory;
  amountCents: number;
  count: number;
  /** 占该月总额的比例（0–1）；总额为 0 时为 0 */
  share: number;
}

export interface ExpenseSummary {
  month: string;
  totalCents: number;
  count: number;
  /** 按金额从多到少排列；含未分类项 */
  byCategory: ExpenseCategoryTotal[];
}

/** 月度汇总。各类别之和恒等于 totalCents（对应 spec 的「各类别之和与月度总额一致」） */
export function summarizeExpenses(month: string, expenses: Expense[]): ExpenseSummary {
  const totals = new Map<ExpenseCategory, { amountCents: number; count: number }>();
  let totalCents = 0;
  for (const e of expenses) {
    totalCents += e.amountCents;
    const cur = totals.get(e.category) ?? { amountCents: 0, count: 0 };
    cur.amountCents += e.amountCents;
    cur.count += 1;
    totals.set(e.category, cur);
  }
  const byCategory: ExpenseCategoryTotal[] = [...totals.entries()]
    .map(([category, v]) => ({
      category,
      amountCents: v.amountCents,
      count: v.count,
      share: totalCents > 0 ? v.amountCents / totalCents : 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents || a.category.localeCompare(b.category));
  return { month, totalCents, count: expenses.length, byCategory };
}
