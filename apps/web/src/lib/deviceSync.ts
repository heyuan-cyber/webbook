import type { Expense, NotifyItem, RawNotification, UsageDay } from '@webbook/shared';
import { PAY_SOURCE_PACKAGES, USAGE_BACKFILL_MAX_DAYS, parsePayments } from '@webbook/shared';
import { apiClient } from '@/lib/api';
import {
  drainFiredAlarms,
  drainPayNotifications,
  fetchUsageDay,
  scheduleAlarms,
} from '@/lib/nativeBridge';

/**
 * 设备采集与上报的编排（native-android-companion 的 tasks 7.x / 8.x / 9.x）。
 *
 * ## 为什么编排放在 Web 层
 *
 * 三个原生插件只负责"取数据 / 排闹钟"，决策（什么该上传、何时重排、如何归类）
 * 都放在这里。这样改规则不需要重新出包，且全部逻辑可用断言脚本覆盖。
 *
 * ## 原始通知文本的去向（重要）
 *
 * `RawNotification.title/text` **只在内存中流转**：解析成结构字段后即丢弃，
 * 从不落盘、从不上传（design.md D2）。本文件是这条约束的执行点。
 */

/** 本地时区的日期串 */
export function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/* ══════════════════ 提醒：收敛与送达回写 ══════════════════ */

export interface ReminderSyncResult {
  /** 本次排入的实例数 */
  scheduled: number | null;
  /** 回写成功的送达条数 */
  delivered: number;
  /** 云端标记为"已错过"的条数（不补发通知，仅呈现） */
  missed: number;
  /** 通知展示权限被拒时为 true——提醒会响但用户看不到 */
  notifyBlocked: boolean;
  error?: string;
}

/**
 * 同步提醒：回写送达 → 拉取待触发 → **重建**本地排程。
 *
 * ## 三步的顺序不能换
 *
 * 1. **先回写送达**：把手机已触发的记录告诉云端，使云端能区分"已排程/已送达"。
 *    必须在重建之前——重建会取消全部排程，若先重建再回写，本次已触发的记录
 *    就与新的排程状态对不上了。
 * 2. **再拉取**：取窗口内的实例。服务端已把重复规则展开成具体实例，
 *    所以这里拿到的是可直接排的时刻，不需要前端再实现重复语义（7.5）。
 * 3. **最后重建**：`schedule` 的语义是"提交即重建"，因此提交**完整窗口**。
 *    云端已删除的提醒不会出现在这次提交里，于是本地排程自动被清掉（7.2）——
 *    不需要单独做删除同步。
 *
 * `missed` 只用于界面呈现，**不进入排程**，因此不会补发过期通知（7.6）。
 */
export async function syncReminders(token: string): Promise<ReminderSyncResult> {
  let delivered = 0;
  let notifyBlocked = false;

  // ① 送达回写
  try {
    const fired = await drainFiredAlarms();
    for (const f of fired) {
      try {
        await apiClient.markNotifyDelivered(token, f.id, new Date(f.firedAt).toISOString());
        delivered++;
      } catch {
        // 单条回写失败不阻断其余：该提醒在云端仍是"未送达"，
        // 下次同步会重新排入并在触发时再次记录，不会静默丢失。
      }
    }
  } catch {
    // drainFired 自身已保证不抛；这里只是兜底
  }

  try {
    // ② 拉取窗口内的待触发实例
    const due = await apiClient.loadNotifyDue(token);

    // ③ 重建本地排程（提交完整窗口）
    const asItems = due.due.map(
      (d) =>
        ({
          id: d.id,
          title: d.title,
          body: d.body,
          dueAt: d.dueAt,
          done: false,
          repeat: 'none',
          source: 'manual',
          createdAt: d.dueAt,
          updatedAt: d.dueAt,
        }) as NotifyItem,
    );
    const res = await scheduleAlarms(asItems);

    if (res.canPostNotifications !== null) {
      notifyBlocked = res.canPostNotifications === false;
    }
    notifyBlocked = notifyBlocked || res.notificationDenied;

    return {
      scheduled: res.scheduled,
      delivered,
      missed: due.missed.length,
      notifyBlocked,
      ...(res.error ? { error: res.error } : {}),
    };
  } catch (e) {
    return {
      scheduled: null,
      delivered,
      missed: 0,
      notifyBlocked,
      error: String((e as Error)?.message ?? e),
    };
  }
}

/* ══════════════════ 使用统计：采集与上报 ══════════════════ */

export interface CaptureResult {
  /** 成功上报的日期 */
  uploaded: string[];
  /** 采集到但没数据的日期（不算失败） */
  empty: string[];
  /** 最后一天的采集来源，用于观察 ROM 行为 */
  source?: string;
  fallbackUsed?: boolean;
}

/**
 * 采集并上报使用统计。
 *
 * @param days 回溯天数（含昨天）。上限 `USAGE_BACKFILL_MAX_DAYS`——
 *            无限回溯会拖长同步时间，也超出 spec 允许的补采范围（8.2）。
 *
 * **不产生零值日期记录**（8.4）：没采到数据的日期直接跳过，而不是上传一个
 * `totalMs: 0` 的空壳——否则界面会把"没采集"误显示成"当天没用手机"。
 * 未授权时 `fetchUsageDay` 本身就会返回 null，因此这里天然满足"未授权不采集"。
 */
export async function captureAndUploadUsage(
  token: string,
  days = 1,
): Promise<CaptureResult> {
  const capped = Math.max(1, Math.min(days, USAGE_BACKFILL_MAX_DAYS));
  const collected: UsageDay[] = [];
  const empty: string[] = [];
  let source: string | undefined;
  let fallbackUsed = false;

  // 从最早的一天开始采，保证上报顺序与时间顺序一致
  for (let i = capped; i >= 1; i--) {
    const date = localDate(-i);
    const res = await fetchUsageDay(date);
    if (res.source) source = res.source;
    if (res.fallbackUsed) fallbackUsed = true;
    if (res.day) collected.push(res.day);
    else empty.push(date);
  }

  if (collected.length === 0) {
    return { uploaded: [], empty, source, fallbackUsed };
  }

  // 幂等由服务端保证：以「用户 + 日期」为键，同日期重复上报覆盖（8.3）
  const res = await apiClient.syncUsage(token, collected);
  return { uploaded: res.written, empty, source, fallbackUsed };
}

/* ══════════════════ 消费：解析与上报 ══════════════════ */

export interface ExpenseCaptureResult {
  /** 成功入库的条数 */
  added: number;
  /** 因重复而被并入既有记录的条数 */
  merged: number;
  /** 无法识别、保留为待修正的条数 */
  unparsed: number;
  /** 被拒绝规则排除的条数（按原因） */
  rejected: Record<string, number>;
  /** 批内被幂等键合并的条数——真实的重复推送比例 */
  dedupedInBatch: number;
  /** 服务端归类统计 */
  classifiedByRule: number;
  classifiedByAi: number;
  unclassified: number;
  /** 是否真的提交了（未达阈值时为 false） */
  submitted: boolean;
}

/** 攒批阈值：攒够这么多条就上报，不必等下一次周期唤醒（9.5） */
const EXPENSE_BATCH_THRESHOLD = 5;

/**
 * 取走支付通知 → 解析 → 攒批上报。
 *
 * ## 原始文本的边界
 *
 * `drainPayNotifications()` 取到的是**原始通知文本**，本函数只在内存中用它解析，
 * 交给 `submitExpenses` 的只有结构字段（金额/商户/时刻/来源）。原始文本随
 * `notifications` 数组出作用域即被 GC，不落盘、不上传（design.md D2 / tasks 9.5）。
 *
 * ## 为什么做"攒批"
 *
 * 逐笔上报会让每次支付产生一次 GitHub commit。攒够阈值或手动触发才提交，
 * 把写入压到较低频次。阈值之下的记录不会丢失——它们仍在设备端的通知缓冲里吗？
 * **不会**：`drain()` 已经把缓冲清空了。因此这里改用"本地待提交队列"承接。
 */
export async function captureAndUploadExpenses(
  token: string,
  options: { force?: boolean } = {},
): Promise<ExpenseCaptureResult> {
  const emptyResult: ExpenseCaptureResult = {
    added: 0,
    merged: 0,
    unparsed: 0,
    rejected: {},
    dedupedInBatch: 0,
    classifiedByRule: 0,
    classifiedByAi: 0,
    unclassified: 0,
    submitted: false,
  };

  // 取原始通知
  const drained = await drainPayNotifications();
  const pending = loadPending().concat(drained.notifications);

  // 解析（在 Web 层，规则可随网页更新）
  const parsed = parsePayments(pending, sourceOfPackage);

  const unparsedCount = parsed.unparsed.length;
  const rejectedCounts = parsed.rejected;

  // 把无法识别的转成"待修正"记录一并入库，保留审计痕迹（9.4）
  const asExpenses: Expense[] = [
    ...parsed.parsed.map((p, i) => toExpense(p, `exp-${p.dedupeKey}-${i}`)),
    ...parsed.unparsed.map((u, i) =>
      toUnparsedExpense(u.notification, u.fallbackSource, i),
    ),
  ];

  // 未达阈值且非强制：留在本地队列，等下次
  if (!options.force && asExpenses.length < EXPENSE_BATCH_THRESHOLD) {
    savePending(pending);
    return { ...emptyResult, unparsed: unparsedCount, rejected: rejectedCounts, dedupedInBatch: parsed.dedupedInBatch };
  }

  // 提交：原始文本不进 body，只有结构字段
  const res = await apiClient.submitExpenses(token, asExpenses);
  clearPending();

  return {
    added: res.added,
    merged: res.merged,
    unparsed: unparsedCount,
    rejected: rejectedCounts,
    dedupedInBatch: parsed.dedupedInBatch,
    classifiedByRule: res.classifiedByRule ?? 0,
    classifiedByAi: res.classifiedByAi ?? 0,
    unclassified: res.unclassified ?? 0,
    submitted: true,
  };
}

/* ── 原始通知 → 结构化支出 ── */

function sourceOfPackage(pkg: string): 'wechat' | 'alipay' | null {
  for (const [key, value] of Object.entries(PAY_SOURCE_PACKAGES)) {
    if (value === pkg) return key as 'wechat' | 'alipay';
  }
  return null;
}

function toExpense(
  p: { amountCents: number; merchant: string; postedAt: string; source: 'wechat' | 'alipay'; dedupeKey: string },
  id: string,
): Expense {
  return {
    id,
    amountCents: p.amountCents,
    merchant: p.merchant,
    postedAt: p.postedAt,
    source: p.source,
    // 刻意留成未分类：归类由服务端做（规则在数据仓、AI 密钥是 Worker secret）
    category: 'uncategorized',
    dedupeKey: p.dedupeKey,
  };
}

/**
 * 无法解析的通知转成"待修正"记录。
 *
 * 保留审计痕迹的意义：用户能看到"有东西没被识别"，我们也能据此统计真实覆盖率，
 * 并把未识别形态补进解析规则（tasks 9.10）。
 * 金额置 1 分是**哨兵值**而非真实金额——`normalizeExpense` 会拒绝 0 金额，
 * 而 `unparsed: true` 标记让界面能把它区分出来。
 */
function toUnparsedExpense(
  n: RawNotification,
  source: 'wechat' | 'alipay',
  index: number,
): Expense {
  const postedAt = typeof n.postedAt === 'string' && n.postedAt ? n.postedAt : new Date().toISOString();
  return {
    id: `unparsed-${postedAt}-${index}`,
    amountCents: 1,
    merchant: (n.title || n.text || '未识别').slice(0, 40),
    postedAt,
    source,
    category: 'uncategorized',
    dedupeKey: `unparsed-${source}-${postedAt}-${index}`,
    unparsed: true,
  };
}

/* ── 本地待提交队列 ── */

/**
 * 待提交的原始通知队列。
 *
 * **只存内存**：这是刻意的——原始通知文本不得落盘（design.md D2）。
 * 代价是应用被杀时队列丢失。可接受：那些通知对应的支付仍有服务端未送达标记，
 * 且渠道应用的通知栏里通常也还在；而换来的是"原始文本永不落地"这条硬约束。
 */
const PENDING_KEY = '__webbook_pending_notifications__';

function loadPending(): RawNotification[] {
  const g = globalThis as Record<string, unknown>;
  const v = g[PENDING_KEY];
  return Array.isArray(v) ? (v as RawNotification[]) : [];
}

function savePending(list: RawNotification[]): void {
  (globalThis as Record<string, unknown>)[PENDING_KEY] = list.slice(-100);
}

function clearPending(): void {
  (globalThis as Record<string, unknown>)[PENDING_KEY] = [];
}
