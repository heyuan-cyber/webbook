import type { ExpenseSource } from './expense.js';
import type { RawNotification } from './nativeBridge.js';
import { computeDedupeKey, normalizeMerchant } from './expense.js';

/**
 * 支付通知解析（native-android-companion 的 tasks 9.1–9.4）。
 *
 * ## 为什么解析在 Web 层
 *
 * 微信/支付宝的通知文案会随版本变化。解析规则写在 Kotlin 里意味着改一条正则就要
 * 重新出包；写在这里则随网页一起更新（design.md D2）。原生侧只交出原始文本。
 *
 * ## 原始文本的去向
 *
 * 本模块**只在内存中处理**原始文本，返回的是结构化字段。调用方不得把
 * `RawNotification.title/text` 落盘或上传——只上传解析结果（spec 的「原始通知文本不外传」）。
 *
 * ## 关于文案假设的诚实说明
 *
 * 下面的正则是基于微信/支付宝公开的常见通知形态写的，**尚未用真机原文校准过**
 * （探针拿到的原文还没回传）。因此：
 *   - 规则写成可增量添加的数组，拿到真实样本后**只改数据不改结构**
 *   - 解析不出结果的通知会进入"待修正"（`unparsed`）而不是被丢弃，
 *     保留审计痕迹，也便于统计真实覆盖率
 *   - 宁可漏记（进待修正）也不要错记：金额提取失败绝不猜
 */

/* ────────────────────────── 类型 ────────────────────────── */

/** 解析成功的结果 */
export interface ParsedPayment {
  ok: true;
  amountCents: number;
  merchant: string;
  postedAt: string;
  source: ExpenseSource;
  dedupeKey: string;
  /** 命中的规则名，用于事后统计哪条规则在起作用 */
  matched: string;
}

/** 解析失败的结果，带原因便于统计 */
export interface ParsedFailure {
  ok: false;
  /** 未识别 / 被拒绝规则排除 */
  reason: 'unrecognized' | 'rejected';
  /** 被拒绝时的具体原因（转账、退款等） */
  rejectedAs?: string;
  /** 原文长度，用于粗略判断是否被截断 */
  textLength: number;
}

export type ParseOutcome = ParsedPayment | ParsedFailure;

/* ────────────────────────── 拒绝规则（9.2）────────────────────────── */

/**
 * 这些通知**不代表一次已完成的支出**，必须排除。
 *
 * 顺序有意义：先判拒绝，再抽金额。否则"退款 ¥18.00"会先被金额正则捞出来
 * 记成一笔支出——那是把收入记成了支出，比漏记更糟。
 *
 * ## 一条踩过的坑：`收款` 不能裸匹配
 *
 * 最初 `income` 规则写的是 `/收款|.../`，结果**把所有正常支付都拒掉了**——
 * 因为微信支付的通知里「**收款方**：瑞幸咖啡」是商户字段标签，属于支出语境。
 * 裸匹配 `收款` 会命中它。
 *
 * 因此这里只匹配**明确表示"钱进来了"的完整短语**（收款成功 / 收款到账 /
 * 已收款 / 收入），不匹配单独的"收款"。**加新规则时请遵守同一原则：
 * 宁可写长短语，也不要写会出现在支出文案里的短词。**
 */
const REJECT_RULES: { name: string; pattern: RegExp }[] = [
  { name: 'refund', pattern: /退款|退回|已退|退费/ },
  { name: 'transfer', pattern: /转账|转账给|收到转账/ },
  { name: 'income', pattern: /收款成功|收款到账|已收款|收入/ },
  { name: 'balance', pattern: /余额|零钱(?:通)?(?:余额)?变动|账户变动/ },
  { name: 'coupon', pattern: /优惠券|红包|立减金|券到账|奖励金|积分/ },
  { name: 'failed', pattern: /失败|已取消|支付超时|交易关闭|未完成|已撤销/ },
  { name: 'bill', pattern: /账单|月账单|消费日报|账单提醒/ },
];

/* ────────────────────────── 金额提取（9.1）────────────────────────── */

/**
 * 金额形态，按可信度从高到低尝试。
 *
 * 每一条都必须捕获**带小数的金额**——不匹配没有小数点的裸数字，
 * 否则会把"订单号 1234567"或"12:30"当金额。
 */
const AMOUNT_PATTERNS: { name: string; pattern: RegExp }[] = [
  // ¥18.00 / ￥18.00 / ¥ 18.00
  { name: 'currency-prefix', pattern: /[¥￥]\s*([0-9]{1,7}(?:\.[0-9]{1,2})?)/ },
  // 18.00元 / 18.00 元
  { name: 'yuan-suffix', pattern: /([0-9]{1,7}(?:\.[0-9]{1,2})?)\s*元/ },
  // CNY 18.00 / RMB 18.00
  { name: 'currency-code', pattern: /(?:CNY|RMB)\s*([0-9]{1,7}(?:\.[0-9]{1,2})?)/i },
  // 金额: 18.00 / 支付18.00（无货币符号，谨慎兜底）
  { name: 'labeled', pattern: /(?:金额|支付|付款|消费|支出)[：:\s]*([0-9]{1,7}\.[0-9]{1,2})/ },
];

/* ────────────────────────── 商户提取（9.1）────────────────────────── */

/**
 * 商户形态。带标签的优先——无标签时把整行当商户会得到垃圾数据。
 */
const MERCHANT_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'label-payee', pattern: /(?:收款方|收款商户|商户名称|商户)[：:\s]*([^\n,，。;；|]{1,40})/ },
  { name: 'label-merchant', pattern: /(?:向|在)\s*([^\n,，。;；|]{1,40}?)\s*(?:付款|支付|消费)/ },
  { name: 'label-trade', pattern: /(?:交易(?:对方|商户)|对方)[：:\s]*([^\n,，。;；|]{1,40})/ },
];

/* ────────────────────────── 渠道判定 ────────────────────────── */

const SOURCE_HINTS: { source: ExpenseSource; pattern: RegExp }[] = [
  { source: 'wechat', pattern: /微信|财付通|wechat/i },
  { source: 'alipay', pattern: /支付宝|花呗|alipay/i },
];

/* ────────────────────────── 解析主体 ────────────────────────── */

function toCents(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // 用 Math.round 兜住浮点误差（18.10 * 100 = 1809.9999…）
  const cents = Math.round(n * 100);
  // 上限 100 万元：超出基本可判定为解析错误，宁可进待修正
  if (cents <= 0 || cents > 100_000_000) return null;
  return cents;
}

/**
 * 清理商户名。
 *
 * 两个真实踩过的坑：
 *   1. 「收款方：瑞幸咖啡  ¥18.00」——商户字段的字符类不排除空格与货币符号，
 *      会把后面的金额一起吞进来，得到 `瑞幸咖啡 ¥18.00`。金额已经在字段里了，
 *      商户名里再带一份既脏又会破坏规则匹配（同一家店因金额不同被当成不同商户）。
 *   2. 尾部的「的付款」「收款方」等标签残留。
 */
function cleanMerchant(raw: string): string {
  let s = raw.replace(/^[\s:：]+/, '');
  // 砍掉从"空白 + 货币符号/数字"开始的部分：那之后是金额，不属于商户名
  s = s.replace(/\s+[¥￥]?\s*[0-9].*$/, '');
  // 砍掉紧贴的货币符号与金额（无空格情形，如"瑞幸咖啡¥18"）
  s = s.replace(/[¥￥]\s*[0-9].*$/, '');
  // 砍掉尾部残留的标签词
  s = s.replace(/(?:的)?(?:付款|支付|消费|收款方|收款|商户|成功)$/, '');
  return normalizeMerchant(s.trim());
}

/**
 * 解析一条通知。
 *
 * `fallbackSource` 由调用方按来源包名给出——比文案里的关键词更可靠，
 * 因此优先于 `SOURCE_HINTS`。
 */
export function parsePayment(
  n: RawNotification,
  fallbackSource: ExpenseSource,
): ParseOutcome {
  const title = typeof n.title === 'string' ? n.title : '';
  const text = typeof n.text === 'string' ? n.text : '';
  const haystack = `${title}\n${text}`;

  // ① 先判拒绝——顺序不能反，否则"退款 ¥18"会被记成支出
  for (const rule of REJECT_RULES) {
    if (rule.pattern.test(haystack)) {
      return {
        ok: false,
        reason: 'rejected',
        rejectedAs: rule.name,
        textLength: haystack.length,
      };
    }
  }

  // ② 抽金额
  let amountCents: number | null = null;
  let matchedAmount = '';
  for (const p of AMOUNT_PATTERNS) {
    const m = haystack.match(p.pattern);
    if (!m) continue;
    const cents = toCents(m[1]!);
    if (cents !== null) {
      amountCents = cents;
      matchedAmount = p.name;
      break;
    }
  }
  if (amountCents === null) {
    return { ok: false, reason: 'unrecognized', textLength: haystack.length };
  }

  // ③ 抽商户
  let merchant = '';
  let matchedMerchant = '';
  for (const p of MERCHANT_PATTERNS) {
    const m = haystack.match(p.pattern);
    if (!m) continue;
    const cleaned = cleanMerchant(m[1]!);
    if (cleaned) {
      merchant = cleaned;
      matchedMerchant = p.name;
      break;
    }
  }

  // ④ 渠道：包名优先于文案关键词
  let source: ExpenseSource = fallbackSource;
  for (const h of SOURCE_HINTS) {
    if (h.pattern.test(haystack)) {
      source = h.source;
      break;
    }
  }

  const postedAt = typeof n.postedAt === 'string' && n.postedAt ? n.postedAt : new Date().toISOString();

  return {
    ok: true,
    amountCents,
    merchant,
    postedAt,
    source,
    dedupeKey: computeDedupeKey({ source, amountCents, merchant, postedAt }),
    matched: [matchedAmount, matchedMerchant].filter(Boolean).join('+'),
  };
}

/* ────────────────────────── 批量解析（9.3 / 9.4）────────────────────────── */

export interface ParseBatchResult {
  /** 可作为支出入库的记录 */
  parsed: ParsedPayment[];
  /** 无法识别的（保留为待修正，不中断后续解析） */
  unparsed: { notification: RawNotification; fallbackSource: ExpenseSource }[];
  /** 被拒绝规则排除的条数，按原因计数 */
  rejected: Record<string, number>;
  /** 批次内因幂等键重复被合并的条数——用于观察重复推送的真实比例（9.10） */
  dedupedInBatch: number;
}

/**
 * 批量解析并按幂等键在**批次内**先合并一次。
 *
 * 批内去重是必要的：微信/支付宝同一笔支付常推 2–3 条措辞不同的通知，
 * 如果只靠服务端按 dedupeKey 合并，它们会带着不同的 `id` 上去，
 * 服务端虽然会合并内容，但 `added` 计数会失真。
 */
export function parsePayments(
  notifications: RawNotification[],
  sourceOf: (pkg: string) => ExpenseSource | null,
): ParseBatchResult {
  const parsed: ParsedPayment[] = [];
  const unparsed: ParseBatchResult['unparsed'] = [];
  const rejected: Record<string, number> = {};
  const seen = new Set<string>();
  let dedupedInBatch = 0;

  for (const n of notifications) {
    const fallbackSource = sourceOf(n.pkg);
    // 非声明渠道直接忽略——不该走到这里，防御性判断
    if (!fallbackSource) continue;

    const outcome = parsePayment(n, fallbackSource);
    if (!outcome.ok) {
      if (outcome.reason === 'rejected') {
        const k = outcome.rejectedAs ?? 'unknown';
        rejected[k] = (rejected[k] ?? 0) + 1;
      } else {
        unparsed.push({ notification: n, fallbackSource });
      }
      continue;
    }

    if (seen.has(outcome.dedupeKey)) {
      dedupedInBatch++;
      continue;
    }
    seen.add(outcome.dedupeKey);
    parsed.push(outcome);
  }

  return { parsed, unparsed, rejected, dedupedInBatch };
}
