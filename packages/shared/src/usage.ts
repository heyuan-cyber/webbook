/**
 * 手机使用统计数据模型（native-android-companion 的 `mobile-usage-tracking`）。
 *
 * 存储形状：`data/users/{userId}/usage/{YYYY-MM-DD}.json`，一天一个分片。
 * 为什么按天分片而不是单文件：唯一的持久层是 GitHub Contents API，整文件读改写，
 * 单文件方案每次追加都要读写全部历史，随天数线性恶化；按天分片则新增一天不触碰既有分片。
 */

export const USAGE_SCHEMA_VERSION = 1;

/** 单日单个应用的前台用量 */
export interface AppUsage {
  /** Android 包名，如 `com.tencent.mm` */
  pkg: string;
  /** 应用显示名；采集时由 PackageManager 解析，解析失败时回退为包名 */
  label: string;
  /** 前台累计时长（毫秒） */
  ms: number;
  /** 启动（进入前台）次数 */
  launches: number;
}

/** 单日使用统计分片 */
export interface UsageDay {
  schemaVersion: number;
  /** 自然日，`YYYY-MM-DD`（本地时区） */
  date: string;
  /** 该日前台使用总时长（毫秒）。合并"其他"后仍必须等于各 app 之和 */
  totalMs: number;
  /** 按 `ms` 从多到少排列 */
  apps: AppUsage[];
  /**
   * 是否发生了应用数截断（超上限的应用被合并为"其他"）。
   * 仅用于界面提示"该日应用过多，已合并"，不影响 totalMs 的准确性。
   */
  truncated?: boolean;
}

/** 单日采集结果里"其他"应用的固定标识 */
export const OTHER_APP_PKG = '__other__';

/** 单日分片保留的应用数上限（超出部分归入"其他"） */
export const USAGE_MAX_APPS = 50;

/** 补采回溯上限：设备长期离线后最多回补多少天 */
export const USAGE_BACKFILL_MAX_DAYS = 7;

export function createEmptyUsageDay(date: string): UsageDay {
  return { schemaVersion: USAGE_SCHEMA_VERSION, date, totalMs: 0, apps: [] };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 分片文件名是否是可辨识的自然日（防止把任意文件名当日期用） */
export function isValidUsageDate(date: string): boolean {
  if (!DAY_RE.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

function toNonNegativeInt(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

/**
 * 归一化单日分片：丢弃结构异常的条目、按时长重排、重算 totalMs。
 *
 * **重算 totalMs 是刻意的**：`totalMs` 必须与 `apps` 之和一致，否则界面的占比会算错。
 * 与其信任传入值，不如由归一化保证这个不变式。
 */
export function normalizeUsageDay(raw: Partial<UsageDay> & { date?: string }): UsageDay {
  const date = typeof raw.date === 'string' && isValidUsageDate(raw.date) ? raw.date : '';
  const apps: AppUsage[] = [];
  const seen = new Set<string>();

  for (const item of Array.isArray(raw.apps) ? raw.apps : []) {
    if (!item || typeof item.pkg !== 'string' || !item.pkg) continue;
    const ms = toNonNegativeInt(item.ms);
    // 时长为零的应用不进入结果（对应 spec 的「零使用应用被排除」）
    if (ms <= 0) continue;
    if (seen.has(item.pkg)) continue;
    seen.add(item.pkg);
    apps.push({
      pkg: item.pkg,
      label: typeof item.label === 'string' && item.label ? item.label : item.pkg,
      ms,
      launches: toNonNegativeInt(item.launches),
    });
  }

  apps.sort((a, b) => b.ms - a.ms || a.pkg.localeCompare(b.pkg));

  return {
    schemaVersion: USAGE_SCHEMA_VERSION,
    date,
    totalMs: apps.reduce((sum, a) => sum + a.ms, 0),
    apps,
    ...(raw.truncated === true ? { truncated: true } : {}),
  };
}

/**
 * 施加应用数上限：超出部分合并为一条"其他"，并保证总时长不变。
 *
 * 不改 `totalMs`——被合并的应用时长被计入"其他"，所以总和不因截断而改变。
 */
export function capUsageApps(day: UsageDay, max: number = USAGE_MAX_APPS): UsageDay {
  if (day.apps.length <= max) return day;
  const kept = day.apps.slice(0, max);
  const restMs = day.apps.slice(max).reduce((sum, a) => sum + a.ms, 0);
  const restLaunches = day.apps.slice(max).reduce((sum, a) => sum + a.launches, 0);
  if (restMs > 0) {
    kept.push({ pkg: OTHER_APP_PKG, label: '其他', ms: restMs, launches: restLaunches });
  }
  return {
    ...day,
    apps: kept,
    truncated: true,
    totalMs: kept.reduce((sum, a) => sum + a.ms, 0),
  };
}

/** 某个应用的时长占该日总时长的比例；总时长为 0 时返回 0 */
export function usageShare(day: UsageDay, app: AppUsage): number {
  return day.totalMs > 0 ? app.ms / day.totalMs : 0;
}
