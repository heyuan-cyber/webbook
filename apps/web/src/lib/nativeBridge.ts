import { Capacitor, registerPlugin } from '@capacitor/core';
import type {
  NativeCapabilities,
  NotifyItem,
  RawNotification,
  UsageDay,
} from '@webbook/shared';
import { NO_NATIVE_CAPABILITIES, normalizeUsageDay, toAlarmSpec } from '@webbook/shared';

/**
 * 三个原生桥在 Web 侧的访问层（native-android-companion 的 tasks 5.2 / 6.13）。
 *
 * ## 一条纪律（Phase 0 的教训）
 *
 * **能力探测不得以 `Capacitor.getPlatform()` 为唯一依据。**
 * Phase 0 的探针 v1 第一行就是 `const { Capacitor } = window.Capacitor;`，无 try/catch。
 * 真机上该全局未就绪 → 整页脚本不执行 → 页面永远停在「检测中…」，连"我挂了"都显示不出来。
 *
 * 因此本模块：
 *   1. 不假设任何插件存在；每次调用都包 try/catch
 *   2. 宿主可用性以「插件调用是否真的返回」为准，`getPlatform()` 只作诊断
 *   3. 任何失败都降级为"能力不可用"，绝不让页面崩掉
 *   4. 浏览器里访问时全部为 false 且不产生错误
 *
 * ## 为什么不用 isInstalledShell()
 *
 * `lib/shellContext.ts` 的 `isInstalledShell()` 靠 `android-app://` referrer、
 * `display-mode: standalone`、UA 里的 `wv` 标记判定。打包版宿主从 `https://localhost`
 * 加载的是普通 WebView 页面，**没有这些标记**，因此不适用于"是否运行在 WebBook 宿主内"。
 */

/* ────────────────────────── 插件接口（与原生实现一一对应）────────────────────────── */

interface AlarmPermissionState {
  canScheduleExactAlarms?: boolean;
  canPostNotifications?: boolean;
  scheduledCount?: number;
  lastFired?: string;
  /** **必须显示**：真机已证实"通知权限被拒时闹钟照响但用户看不到" */
  notificationDenied?: boolean;
  notificationDeniedCount?: number;
}

interface AlarmPlugin {
  schedule(options: { alarms: unknown[] }): Promise<{ scheduled?: number; skipped?: number }>;
  cancelAll(): Promise<{ ok?: boolean }>;
  checkPermissions(): Promise<AlarmPermissionState>;
  /** tasks 7.4：取走"已触发但还没回写"的记录，取走即清空 */
  drainFired(): Promise<{ fired?: { id: string; firedAt: number }[]; notificationDenied?: boolean }>;
}

interface UsagePlugin {
  daily(options: { date: string }): Promise<unknown>;
  hasPermission(): Promise<{ granted?: boolean }>;
  requestPermission(): Promise<{ opened?: boolean }>;
}

interface PayPlugin {
  drain(): Promise<{
    notifications?: RawNotification[];
    granted?: boolean;
    connected?: boolean;
    totalKept?: number;
  }>;
  hasPermission(): Promise<{ granted?: boolean; connected?: boolean }>;
  requestPermission(): Promise<{ opened?: boolean }>;
  /** tasks 6.11：静默解绑的探测与自愈 */
  healthCheck(): Promise<{ state?: string; granted?: boolean; connected?: boolean }>;
}

/** 注册本身不做原生往返，因此这里调用是安全的；可用性由 probeNativeBridge 判定 */
const Alarm = registerPlugin<AlarmPlugin>('ReminderAlarm');
const Usage = registerPlugin<UsagePlugin>('UsageStats');
const Pay = registerPlugin<PayPlugin>('PayListener');

/* ────────────────────────── 能力探测 ────────────────────────── */

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

async function callable(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
}

/**
 * 探测宿主能力。**保证不抛异常**——任何环节失败都返回 `NO_NATIVE_CAPABILITIES`
 * 并附诊断信息，让界面永远有东西可显示。
 */
export async function probeNativeBridge(): Promise<NativeCapabilities> {
  const diagnostic = {
    capacitorGlobal: safe(() => typeof Capacitor, 'undefined'),
    platform: safe(() => Capacitor.getPlatform(), 'undefined'),
  };

  try {
    const nativePlatform = safe(() => Capacitor.isNativePlatform(), false);
    const alarmRegistered = safe(() => Capacitor.isPluginAvailable('ReminderAlarm'), false);
    const usageRegistered = safe(() => Capacitor.isPluginAvailable('UsageStats'), false);
    const payRegistered = safe(() => Capacitor.isPluginAvailable('PayListener'), false);

    if (!nativePlatform && !alarmRegistered && !usageRegistered && !payRegistered) {
      return { ...NO_NATIVE_CAPABILITIES, diagnostic };
    }

    // 第二层：真调一次。"已注册但调用失败"是真实存在的状态（桥未就绪），
    // 只信 isPluginAvailable 会把它误判成可用。
    const usage = usageRegistered && (await callable(() => Usage.hasPermission()));
    const pay = payRegistered && (await callable(() => Pay.hasPermission()));
    // 排程桥用 checkPermissions 探测——它是只读的，不像 schedule 会改动排程
    const alarm = alarmRegistered && (await callable(() => Alarm.checkPermissions()));

    if (!usage && !pay && !alarm) {
      return {
        ...NO_NATIVE_CAPABILITIES,
        diagnostic: { ...diagnostic, error: '插件已注册但调用失败' },
      };
    }

    return { inHost: true, usage, payListener: pay, reminders: alarm, diagnostic };
  } catch (e) {
    return {
      ...NO_NATIVE_CAPABILITIES,
      diagnostic: { ...diagnostic, error: String((e as Error)?.message ?? e) },
    };
  }
}

/* ────────────────────────── 提醒排程 ────────────────────────── */

export interface AlarmSyncResult {
  scheduled: number | null;
  /** 精确闹钟权限是否具备；不具备时会降级为不精确排程 */
  exactAllowed: boolean | null;
  /** **通知展示权限被拒时，提醒会响但看不到**——这是必须向用户暴露的状态 */
  canPostNotifications: boolean | null;
  notificationDenied: boolean;
  error?: string;
}

/**
 * 提交提醒排程。
 *
 * **语义是"提交即重建"**：原生会先取消本应用全部排程再按传入的这组重建。
 * 因此调用方必须提交完整窗口内容，只提交新增会导致旧排程被清掉。
 *
 * @param alarms 已展开的具体实例（重复规则在服务端展开，不要传列表里的单条 dueAt）
 */
export async function scheduleAlarms(alarms: NotifyItem[]): Promise<AlarmSyncResult> {
  const specs = alarms.flatMap((item) => {
    if (!item.dueAt || item.done) return [];
    return [toAlarmSpec(item, item.dueAt)];
  });

  try {
    const res = await Alarm.schedule({ alarms: specs });
    const perm = await Alarm.checkPermissions().catch(() => null);
    return {
      scheduled: typeof res?.scheduled === 'number' ? res.scheduled : specs.length,
      exactAllowed: perm?.canScheduleExactAlarms ?? null,
      canPostNotifications: perm?.canPostNotifications ?? null,
      notificationDenied: perm?.notificationDenied === true,
    };
  } catch (e) {
    return {
      scheduled: null,
      exactAllowed: null,
      canPostNotifications: null,
      notificationDenied: false,
      error: String((e as Error)?.message ?? e),
    };
  }
}

export async function cancelAllAlarms(): Promise<boolean> {
  return callable(() => Alarm.cancelAll());
}

export async function checkAlarmPermissions(): Promise<AlarmPermissionState | null> {
  try {
    return await Alarm.checkPermissions();
  } catch {
    return null;
  }
}

/**
 * 取走"已触发但还没回写云端"的提醒（tasks 7.4）。
 *
 * 云端需要区分「已排程」与「已送达」，而**判定只能由手机侧给出**——
 * 只有它知道闹钟到底有没有响。原生侧累积记录（而非只留最近一次），
 * 因为回写是批量的，只留一条会漏掉中间触发的那些。
 */
export async function drainFiredAlarms(): Promise<
  { id: string; firedAt: number }[]
> {
  try {
    const res = await Alarm.drainFired();
    const list = Array.isArray(res?.fired) ? res.fired : [];
    return list.filter(
      (f): f is { id: string; firedAt: number } =>
        !!f && typeof f.id === 'string' && f.id.length > 0,
    );
  } catch {
    return [];
  }
}

/* ────────────────────────── 使用统计 ────────────────────────── */

export interface UsageFetchResult {
  day: UsageDay | null;
  /** 原生实际用的取数路径，用于观察 ROM 行为（`queryUsageStats` / `queryEvents`） */
  source?: string;
  fallbackUsed?: boolean;
}

/**
 * 取某一天的使用统计并归一化。
 *
 * 归一化放在这里（而不是原生）是刻意的：`normalizeUsageDay` 在 Worker 与断言脚本
 * 里跑同一份实现，放原生会导致三处口径可能不一致。
 */
export async function fetchUsageDay(date: string): Promise<UsageFetchResult> {
  try {
    const raw = (await Usage.daily({ date })) as Record<string, unknown> | null;
    const day = normalizeUsageDay((raw ?? {}) as Partial<UsageDay>);
    return {
      // 归一化后没有数据的日期不算"有数据"，避免把"没采集"显示成"当天没用手机"
      day: day.date && day.apps.length > 0 ? day : null,
      source: typeof raw?.source === 'string' ? raw.source : undefined,
      fallbackUsed: raw?.fallbackUsed === true,
    };
  } catch {
    return { day: null };
  }
}

export async function requestUsagePermission(): Promise<boolean> {
  return callable(() => Usage.requestPermission());
}

/* ────────────────────────── 支付通知 ────────────────────────── */

export interface PayDrainResult {
  notifications: RawNotification[];
  granted: boolean;
  connected: boolean;
  totalKept: number;
}

/**
 * 取走并清空积压的支付通知。
 *
 * 返回的是**原始通知文本**，按设计只在设备内存中流转：调用方解析后即应丢弃，
 * 不得落盘、不得上传（design.md D2）。
 */
export async function drainPayNotifications(): Promise<PayDrainResult> {
  try {
    const res = await Pay.drain();
    const list = Array.isArray(res?.notifications) ? res.notifications : [];
    return {
      notifications: list.filter(
        (n): n is RawNotification =>
          !!n && typeof n.title === 'string' && typeof n.text === 'string' && !!n.pkg,
      ),
      granted: res?.granted === true,
      connected: res?.connected === true,
      totalKept: typeof res?.totalKept === 'number' ? res.totalKept : 0,
    };
  } catch {
    return { notifications: [], granted: false, connected: false, totalKept: 0 };
  }
}

export async function requestPayPermission(): Promise<boolean> {
  return callable(() => Pay.requestPermission());
}

/**
 * 通知监听的健康检查（tasks 6.11）。
 *
 * 监听会被系统在内存压力下**静默解绑**——没有回调、没有提示，只表现为
 * "支付不再被记录"。用户很难把"这周没记到账"与"服务被解绑"联系起来。
 * 因此启动与周期同步时都应调一次，由原生在已授权但掉线时请求重绑。
 */
export async function checkPayListenerHealth(): Promise<{
  state: string;
  granted: boolean;
  connected: boolean;
}> {
  try {
    const res = await Pay.healthCheck();
    return {
      state: typeof res?.state === 'string' ? res.state : 'unknown',
      granted: res?.granted === true,
      connected: res?.connected === true,
    };
  } catch {
    return { state: 'unavailable', granted: false, connected: false };
  }
}
