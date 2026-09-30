/**
 * 到点提醒数据模型（native-android-companion 的 `mobile-reminders`）。
 *
 * 存储形状：`data/users/{userId}/notify.json`，**单文件**。
 *
 * 为什么不与旧 `reminders.json` 共用文件（design.md 的 D8）：
 * 那个文件归 `webbook-node-planner` 的规划迁移所有。其 `mergeReminders` 的过滤器是
 * 「有 `id` 且有 `text`」，会在用户首次加载 `/api/plan` 时把命中的条目**永久**并入
 * `plan.json`（无论有无条目都会落下 `migratedReminders` 标记，因此污染不可逆）。
 * 所以：
 *   1. 本模型使用独立路径 `USER_NOTIFY_PATH`
 *   2. **本模型的类型不含 `text` 字段**（用 `title` + `body`）——从根上排除被误吞的可能
 */

export const NOTIFY_SCHEMA_VERSION = 1;

/**
 * 重复方式：有限枚举。spec 明确要求"不存在其他可选的重复方式"，
 * 因此刻意不引入完整的 RRULE 日历语法。
 */
export type NotifyRepeat = 'none' | 'daily' | 'weekly' | 'weekdays';

export const NOTIFY_REPEATS: readonly NotifyRepeat[] = ['none', 'daily', 'weekly', 'weekdays'];

export const NOTIFY_REPEAT_LABELS: Record<NotifyRepeat, string> = {
  none: '不重复',
  daily: '每天',
  weekly: '每周',
  weekdays: '工作日',
};

export function isNotifyRepeat(v: unknown): v is NotifyRepeat {
  return typeof v === 'string' && (NOTIFY_REPEATS as readonly string[]).includes(v);
}

/** 提醒来源。仅作标记，不影响同步与送达行为 */
export type NotifySource = 'manual' | 'note' | 'task';

/**
 * 一条提醒。
 *
 * `dueAt` 为**可选**——这不是疏漏。spec 的「缺少触发时刻的提醒」场景要求：
 * 无触发时刻的提醒「以"仅记录、不定时"的形态保留，不产生通知」。
 * 因此模型保留这种形态，由送达侧（`isDeliverable`）排除它，而不是在归一化时丢弃。
 */
export interface NotifyItem {
  id: string;
  /** 通知标题 */
  title: string;
  /** 通知正文，可空 */
  body: string;
  /**
   * 触发时刻（ISO 8601，绝对时刻语义）。
   * 存绝对时刻而非本地墙上时间：跨时区后不偏移，手机侧再换算为本地触发点。
   */
  dueAt?: string;
  repeat: NotifyRepeat;
  done: boolean;
  source: NotifySource;
  /** 最近一次被送达的时刻；用于区分"已排程"与"已送达" */
  notifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** 提醒集合（单文件） */
export interface NotifyIndex {
  schemaVersion: number;
  items: NotifyItem[];
}

/** 待触发窗口的默认天数：手机每次唤醒重排未来这些天内的实例 */
export const NOTIFY_DUE_WINDOW_DAYS = 7;

export function createEmptyNotifyIndex(): NotifyIndex {
  return { schemaVersion: NOTIFY_SCHEMA_VERSION, items: [] };
}

/* ────────────────────────── 归一化 ────────────────────────── */

function normStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

/** 合法 ISO 时刻判定（能被 Date 解析且含时区信息或标准格式） */
export function isValidInstant(v: unknown): v is string {
  if (typeof v !== 'string' || !v) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime());
}

/**
 * 归一化单条提醒；结构不可用的返回 null 由调用方丢弃。
 *
 * 与 task 3.4 字面描述的一处偏离（已记录）：原文写"丢弃无 `dueAt` 的条目"，
 * 但 spec 要求这种条目**保留**为"仅记录、不定时"。二者冲突时以 spec 为准，
 * 因为 spec 是行为契约。丢弃只针对"连 id 或标题都没有"的坏数据。
 */
export function normalizeNotifyItem(raw: Partial<NotifyItem>): NotifyItem | null {
  const id = normStr(raw.id);
  const title = normStr(raw.title);
  if (!id || !title) return null;

  const now = new Date().toISOString();
  const createdAt = isValidInstant(raw.createdAt) ? raw.createdAt : now;
  const repeat: NotifyRepeat = isNotifyRepeat(raw.repeat) ? raw.repeat : 'none';
  const source: NotifySource =
    raw.source === 'note' || raw.source === 'task' ? raw.source : 'manual';

  return {
    id,
    title,
    body: normStr(raw.body),
    // 仅接受可解析的时刻；不可解析视同"未设触发时刻"，保留为不定时条目
    ...(isValidInstant(raw.dueAt) ? { dueAt: raw.dueAt } : {}),
    repeat,
    done: raw.done === true,
    source,
    ...(isValidInstant(raw.notifiedAt) ? { notifiedAt: raw.notifiedAt } : {}),
    createdAt,
    updatedAt: isValidInstant(raw.updatedAt) ? raw.updatedAt : createdAt,
  };
}

/** 集合归一化：丢弃坏数据、按 id 去重（后者覆盖前者）、按触发时刻排序 */
export function normalizeNotifyIndex(raw: Partial<NotifyIndex>): NotifyIndex {
  const byId = new Map<string, NotifyItem>();
  for (const item of Array.isArray(raw.items) ? raw.items : []) {
    const n = normalizeNotifyItem(item ?? {});
    if (n) byId.set(n.id, n);
  }
  return {
    schemaVersion: NOTIFY_SCHEMA_VERSION,
    items: [...byId.values()].sort(compareNotifyItems),
  };
}

/** 排序：有触发时刻的在前并按时间升序，不定时的沉底 */
export function compareNotifyItems(a: NotifyItem, b: NotifyItem): number {
  if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
  if (a.dueAt) return -1;
  if (b.dueAt) return 1;
  return b.createdAt.localeCompare(a.createdAt);
}

/* ────────────────────────── 查询 ────────────────────────── */

/** 是否参与送达：有触发时刻、未完成、且未被标记完成 */
export function isDeliverable(item: NotifyItem): boolean {
  return !!item.dueAt && !item.done;
}

/**
 * 某时刻是否已过期且未送达。
 * 用于界面上把"错过的提醒"单列出来——不补发通知，但要能被看见。
 */
export function isMissed(item: NotifyItem, now: Date = new Date()): boolean {
  if (!isDeliverable(item) || !item.dueAt) return false;
  return new Date(item.dueAt).getTime() < now.getTime() && !item.notifiedAt;
}

/**
 * 把重复规则展开为 `[from, to)` 窗口内的具体触发实例。
 *
 * 语义：`dueAt` 是**基准时刻**，重复在此之上按规则推进。
 *   - `none`     : 只有基准时刻本身
 *   - `daily`    : 每天同一本地时刻
 *   - `weekly`   : 每周同一星期几的同一本地时刻
 *   - `weekdays` : 周一至周五的同一本地时刻
 *
 * Workdays 的判定按**本地**日历进行：提醒是"本地 8 点"这样的绝对时刻语义，
 * 用 UTC 判定会让跨时区用户的"工作日"错位。
 *
 * 单次调用最多展开 `maxInstances` 个（默认 64），避免长时间跨度下的失控循环。
 */
export function expandNotifyInstances(
  item: NotifyItem,
  from: Date,
  to: Date,
  maxInstances = 64,
): string[] {
  if (!item.dueAt || item.done) return [];
  const base = new Date(item.dueAt);
  if (Number.isNaN(base.getTime())) return [];

  if (item.repeat === 'none') {
    return base >= from && base < to ? [base.toISOString()] : [];
  }

  const out: string[] = [];
  const cursor = new Date(base.getTime());

  // 从基准时刻开始按天推进；先快进到窗口附近，避免从很久以前逐日循环
  const dayMs = 86_400_000;
  if (cursor < from) {
    const skipDays = Math.floor((from.getTime() - cursor.getTime()) / dayMs);
    if (skipDays > 0) cursor.setTime(cursor.getTime() + skipDays * dayMs);
  }

  let guard = 0;
  while (cursor < to && out.length < maxInstances && guard < 4000) {
    guard++;
    const inWindow = cursor >= from;
    if (inWindow && matchesRepeat(item.repeat, base, cursor)) {
      out.push(cursor.toISOString());
    }
    cursor.setTime(cursor.getTime() + dayMs);
  }
  return out;
}

/** 判断某一天是否命中重复规则（与基准时刻比较星期几 / 是否工作日） */
function matchesRepeat(repeat: NotifyRepeat, base: Date, candidate: Date): boolean {
  if (repeat === 'daily') return true;
  if (repeat === 'weekly') return base.getDay() === candidate.getDay();
  if (repeat === 'weekdays') {
    const d = candidate.getDay();
    return d >= 1 && d <= 5;
  }
  return false;
}
