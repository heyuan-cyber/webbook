/**
 * 三个原生桥的 TypeScript 契约（native-android-companion 的 design.md D2）。
 *
 * ## 一条硬性分工原则
 *
 * **原生侧只搬运，不做业务判断。** Kotlin 交出原始数据，解析/分类/去重/重试全部在
 * Web 层（TypeScript）完成。理由：微信/支付宝的通知文案会随版本变化，解析规则写在
 * Kotlin 里意味着改一条正则就要重新出包；写在 Web 层则随网页一起更新。
 *
 * ## 能力探测的纪律
 *
 * 探测"宿主是否可用"**不得以 `Capacitor.getPlatform()` 为唯一依据**。
 * 理由有二：
 *   1. 该值只是读一个全局变量，历史上曾在远程加载场景下失效（capacitor#2373）
 *   2. 更根本的是——**桥不可用时页面照常渲染**，只是所有原生能力静默失效
 *
 * 因此探测必须落到"插件调用是否真的返回"上。`probeNativeBridge()` 就是这个口径的实现，
 * 且它自身绝不抛异常（对应 Phase 0 探针 v1 的教训：诊断代码假设被测对象存在，
 * 结果自己挂了却连失败都显示不出来）。
 */

import type { NotifyItem } from './notify.js';

/* ────────────────────────── 能力探测 ────────────────────────── */

export interface NativeCapabilities {
  /** 是否运行在 WebBook 宿主内（以"插件调用真的返回"为准，而非 getPlatform） */
  inHost: boolean;
  /** 使用统计是否可用（已授予使用情况访问权限） */
  usage: boolean;
  /** 支付通知监听是否可用（已授予通知使用权） */
  payListener: boolean;
  /** 提醒排程是否可用（精确闹钟权限 + 通知展示权限） */
  reminders: boolean;
  /**
   * 诊断信息。宿主不可用时这是唯一的线索来源，因此即便全部为 false 也保留。
   * 不要用于业务判断。
   */
  diagnostic?: {
    /** `typeof window.Capacitor`，桥缺失时应为 `'undefined'` */
    capacitorGlobal: string;
    /** `Capacitor.getPlatform()` 的原始返回，缺失时为 `'undefined'` */
    platform: string;
    /** 插件调用失败时的错误消息 */
    error?: string;
  };
}

/** 全部不可用——浏览器访问时的返回值 */
export const NO_NATIVE_CAPABILITIES: NativeCapabilities = {
  inHost: false,
  usage: false,
  payListener: false,
  reminders: false,
};

/* ────────────────────────── 1. 提醒排程 ────────────────────────── */

/** 传给原生的单个排程实例 */
export interface AlarmSpec {
  /** 提醒 id（原生据此派生稳定的 PendingIntent request code，保证重建时覆盖而非堆叠） */
  id: string;
  /** 触发时刻 ISO 8601 */
  dueAt: string;
  title: string;
  body: string;
}

export interface ScheduleAlarmsResult {
  /** 实际排入的实例数 */
  scheduled: number;
}

/**
 * 提醒排程桥。
 *
 * 语义：**提交即重建**——原生按传入的这一组重建全部本地排程，
 * 因此调用方必须提交完整的窗口内容，而不是增量。
 */
export interface ReminderAlarmBridge {
  schedule(input: { alarms: AlarmSpec[] }): Promise<ScheduleAlarmsResult>;
  /** 取消全部排程（用于账号登出等场景） */
  cancelAll(): Promise<void>;
}

/* ────────────────────────── 2. 使用统计 ────────────────────────── */

export interface UsageStatsBridge {
  /**
   * 取某一天的使用统计。`date` 为 `YYYY-MM-DD`（本地自然日）。
   * 返回结构与 `UsageDay` 对齐，但**不保证已归一化**——调用方仍需走 `normalizeUsageDay`。
   */
  daily(input: { date: string }): Promise<unknown>;
  /** 查询使用情况访问权限是否已授予 */
  hasPermission(): Promise<{ granted: boolean }>;
  /** 跳转系统设置页引导授权 */
  requestPermission(): Promise<void>;
}

/* ────────────────────────── 3. 支付通知监听 ────────────────────────── */

/**
 * 原始通知。**这是唯一允许承载原始通知文本的结构**——
 * 它只在设备内存中流转：解析后即弃，不落盘、不上云。
 */
export interface RawNotification {
  /** 通知标题原文 */
  title: string;
  /** 通知正文原文 */
  text: string;
  /** 来源包名，如 `com.tencent.mm` */
  pkg: string;
  /** 通知产生时刻 ISO 8601 */
  postedAt: string;
}

export interface PayListenerBridge {
  /** 取走并清空自上次调用以来积压的通知 */
  drain(): Promise<{ notifications: RawNotification[] }>;
  hasPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<void>;
}

/* ────────────────────────── 已声明渠道 ────────────────────────── */

/**
 * 只处理明确声明的支付渠道。其他来源的通知一律忽略且不保存
 * （对应 spec 的「仅处理声明的渠道」）。
 */
export const PAY_SOURCE_PACKAGES = {
  wechat: 'com.tencent.mm',
  alipay: 'com.eg.android.AlipayGphone',
} as const;

export function paySourceOf(pkg: string): 'wechat' | 'alipay' | null {
  for (const [key, value] of Object.entries(PAY_SOURCE_PACKAGES)) {
    if (value === pkg) return key as 'wechat' | 'alipay';
  }
  return null;
}

/* ────────────────────────── 桥的聚合访问 ────────────────────────── */

/** 三个桥的聚合句柄。宿主不可用时各字段为 null */
export interface NativeBridges {
  alarm: ReminderAlarmBridge | null;
  usage: UsageStatsBridge | null;
  pay: PayListenerBridge | null;
}

/** 把提醒项转成排程实例（只保留可送达的） */
export function toAlarmSpec(item: NotifyItem, dueAt: string): AlarmSpec {
  return { id: item.id, dueAt, title: item.title, body: item.body };
}
