/**
 * 最小断言：native-android-companion 的共享数据模型。
 *
 * 用法：npm run build --workspace packages/shared && node scripts/assert-companion-models.mjs
 *
 * 覆盖三组不变式，都是"错了会静默出错"的类型：
 *   1. 提醒与旧 reminders.json 的隔离（design.md D8）——共用文件会被规划迁移吞掉
 *   2. 使用统计的归一化（totalMs 必须与 apps 之和一致，否则界面占比算错）
 *   3. 消费的幂等键与合并（重复通知不能重复计数）
 */
import {
  USER_NOTIFY_PATH,
  USER_REMINDERS_PATH,
  USAGE_MAX_APPS,
  capUsageApps,
  computeDedupeKey,
  createEmptyNotifyIndex,
  createEmptyUsageDay,
  expandNotifyInstances,
  isDeliverable,
  isMissed,
  mergeExpenses,
  normalizeExpense,
  normalizeExpenseMonth,
  normalizeExpenseRules,
  normalizeNotifyIndex,
  normalizeNotifyItem,
  normalizeUsageDay,
  parsePayments,
  summarizeExpenses,
  usageShare,
} from '../packages/shared/dist/index.js';

let count = 0;
function assert(cond, msg) {
  count += 1;
  if (!cond) throw new Error(`✗ ${msg}`);
}
function eq(actual, expected, msg) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${msg}（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）`,
  );
}

/* ══════════════════ 1. 与旧 reminders.json 的隔离 ══════════════════ */

eq(
  USER_NOTIFY_PATH('u1') === USER_REMINDERS_PATH('u1'),
  false,
  '新版提醒路径必须与旧 reminders.json 不同',
);
assert(
  USER_NOTIFY_PATH('u1').endsWith('/notify.json'),
  '新版提醒路径应指向 notify.json',
);

/* ══════════════════ 2. 提醒模型 ══════════════════ */

// 无 dueAt 的条目必须**保留**为"仅记录、不定时"（spec「缺少触发时刻的提醒」）
const noDue = normalizeNotifyItem({ id: 'a', title: '不定时的事' });
assert(noDue !== null, '无 dueAt 但有标题的条目应被保留，而不是丢弃');
eq(noDue.dueAt, undefined, '无 dueAt 的条目不应凭空获得触发时刻');
eq(isDeliverable(noDue), false, '无 dueAt 的条目不参与送达');
eq(expandNotifyInstances(noDue, new Date(0), new Date(9e12)), [], '无 dueAt 不产生实例');

// 连 id 或标题都没有的坏数据才丢弃
eq(normalizeNotifyItem({ title: '没 id' }), null, '缺 id 应丢弃');
eq(normalizeNotifyItem({ id: 'x' }), null, '缺标题应丢弃');
eq(normalizeNotifyItem({ id: 'y', title: '有 dueAt', dueAt: '不是时间' }).dueAt, undefined, '不可解析的 dueAt 应视同未设');

// 不含 text 字段（会被 plan 迁移误吞）
const withText = normalizeNotifyItem({ id: 'z', title: 'T', text: '不该出现' });
eq('text' in withText, false, '归一化结果不得带 text 字段');

// 集合去重与排序
const idx = normalizeNotifyIndex({
  items: [
    { id: 'b', title: '晚', dueAt: '2026-06-02T01:00:00.000Z' },
    { id: 'a', title: '早', dueAt: '2026-06-01T01:00:00.000Z' },
    { id: 'a', title: '早（覆盖）', dueAt: '2026-06-01T01:00:00.000Z' },
    { id: 'c', title: '不定时' },
  ],
});
eq(idx.items.length, 3, '同 id 应去重');
eq(idx.items[0].title, '早（覆盖）', '重复 id 后者覆盖前者');
eq(idx.items[2].title, '不定时', '无 dueAt 的条目排在末尾');

// 重复规则展开
const base = { id: 'r', title: 'R', body: '', repeat: 'daily', done: false, source: 'manual', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', dueAt: '2026-06-01T01:00:00.000Z' };
const daily = expandNotifyInstances(base, new Date('2026-06-01T00:00:00Z'), new Date('2026-06-04T00:00:00Z'));
eq(daily.length, 3, 'daily 在 3 天窗口内应产生 3 个实例');

const weekly = expandNotifyInstances(
  { ...base, repeat: 'weekly' },
  new Date('2026-06-01T00:00:00Z'),
  new Date('2026-06-30T00:00:00Z'),
);
assert(weekly.length >= 4 && weekly.length <= 5, `weekly 一个月内应产生 4–5 个实例，实际 ${weekly.length}`);

const oneShot = expandNotifyInstances(
  { ...base, repeat: 'none' },
  new Date('2026-06-01T00:00:00Z'),
  new Date('2026-06-30T00:00:00Z'),
);
eq(oneShot.length, 1, 'none 只产生基准时刻本身');

const outside = expandNotifyInstances(base, new Date('2027-01-01T00:00:00Z'), new Date('2027-01-02T00:00:00Z'));
eq(outside.length, 1, '窗口外的重复提醒在窗口内仍应正常展开');

eq(expandNotifyInstances({ ...base, done: true }, new Date(0), new Date(9e12)), [], '已完成的提醒不产生实例');

// 窗口边界：from 含、to 不含
const edge = expandNotifyInstances({ ...base, repeat: 'none' }, new Date('2026-06-01T01:00:00.000Z'), new Date('2026-06-01T02:00:00.000Z'));
eq(edge.length, 1, 'from 闭区间应包含触发时刻');
const edge2 = expandNotifyInstances({ ...base, repeat: 'none' }, new Date('2026-06-01T00:00:00.000Z'), new Date('2026-06-01T01:00:00.000Z'));
eq(edge2.length, 0, 'to 开区间应排除恰好等于 to 的时刻');

// 过期未送达
assert(isMissed({ ...base, notifiedAt: undefined }, new Date('2026-06-05T00:00:00Z')), '过去且未送达应判为错过');
eq(isMissed({ ...base, notifiedAt: '2026-06-01T01:00:01.000Z' }, new Date('2026-06-05T00:00:00Z')), false, '已送达不算错过');

eq(createEmptyNotifyIndex().items, [], '空集合工厂');

/* ══════════════════ 3. 使用统计归一化 ══════════════════ */

const undated = normalizeUsageDay({ date: '2026-06-13', apps: [{ pkg: 'a', label: 'A', ms: 100, launches: 2 }] });
eq(undated.totalMs, 100, 'totalMs 应重算为 apps 之和');
eq(usageShare(undated, undated.apps[0]), 1, '单应用占比应为 1');

// totalMs 由归一化保证，不信任传入值
const lying = normalizeUsageDay({ date: '2026-06-13', totalMs: 99999, apps: [{ pkg: 'a', label: 'A', ms: 100, launches: 1 }] });
eq(lying.totalMs, 100, 'totalMs 应被重算而不是采信传入的 99999');

// 零时长应用被排除
eq(normalizeUsageDay({ date: '2026-06-13', apps: [{ pkg: 'a', ms: 0 }, { pkg: 'b', ms: 5 }] }).apps.length, 1, '零时长应用应被排除');

// 坏数据
eq(normalizeUsageDay({ date: '2026-06-13', apps: [null, {}, { pkg: '' }, { pkg: 'ok', ms: 7 }] }).apps.length, 1, '结构异常的条目应被丢弃');
eq(normalizeUsageDay({ date: 'bad-date', apps: [] }).date, '', '非法日期应归一为空串');

// 按 ms 降序
const sorted = normalizeUsageDay({ date: '2026-06-13', apps: [{ pkg: 's', ms: 1 }, { pkg: 'l', ms: 9 }] });
eq(sorted.apps.map((a) => a.pkg), ['l', 's'], '应用应按时长降序');

// 上限合并：总时长不变
const many = normalizeUsageDay({
  date: '2026-06-13',
  apps: Array.from({ length: USAGE_MAX_APPS + 10 }, (_, i) => ({ pkg: `p${i}`, ms: 1000, launches: 1 })),
});
const capped = capUsageApps(many);
eq(capped.apps.length, USAGE_MAX_APPS + 1, `应保留 ${USAGE_MAX_APPS} 个 + 1 条"其他"`);
eq(capped.totalMs, many.totalMs, '截断后总时长必须不变');
eq(capped.truncated, true, '截断应被标记');
eq(capUsageApps(normalizeUsageDay({ date: '2026-06-13', apps: [{ pkg: 'a', ms: 1 }] })).truncated, undefined, '未截断不应带标记');
eq(createEmptyUsageDay('2026-06-13').totalMs, 0, '空分片工厂');

/* ══════════════════ 4. 消费幂等与汇总 ══════════════════ */

const t = '2026-06-13T10:30:15.000Z';
const k1 = computeDedupeKey({ source: 'wechat', amountCents: 1800, merchant: '瑞幸咖啡', postedAt: t });
// 同一分钟内、时间戳差几秒 → 同一笔，键必须相同
const k2 = computeDedupeKey({ source: 'wechat', amountCents: 1800, merchant: '瑞幸咖啡', postedAt: '2026-06-13T10:30:48.000Z' });
eq(k1 === k2, true, '同一分钟内同一笔应得到相同幂等键');
// 跨分钟 → 视为两笔
const k3 = computeDedupeKey({ source: 'wechat', amountCents: 1800, merchant: '瑞幸咖啡', postedAt: '2026-06-13T10:31:05.000Z' });
eq(k1 === k3, false, '跨分钟的同额同商户应视为两笔');
// 不同渠道 → 不同键
eq(k1 === computeDedupeKey({ source: 'alipay', amountCents: 1800, merchant: '瑞幸咖啡', postedAt: t }), false, '不同渠道应得到不同键');
// 商户归一化影响键
eq(
  computeDedupeKey({ source: 'wechat', amountCents: 1, merchant: '  瑞 幸  ', postedAt: t }) ===
    computeDedupeKey({ source: 'wechat', amountCents: 1, merchant: '瑞 幸', postedAt: t }),
  true,
  '商户空白差异不应产生不同键',
);

// normalizeExpense 严拒
eq(normalizeExpense({ id: 'e1', amountCents: 0, merchant: 'm', postedAt: t, source: 'wechat' }), null, '金额为 0 应丢弃');
eq(normalizeExpense({ id: 'e1', amountCents: 100, merchant: 'm', postedAt: t, source: 'other' }), null, '未声明渠道应丢弃');
eq(normalizeExpense({ id: 'e1', amountCents: 100, merchant: 'm', postedAt: '', source: 'wechat' }), null, '缺时刻应丢弃');
eq(normalizeExpense({ id: 'e1', amountCents: 100, merchant: 'm', postedAt: t, source: 'wechat' }).category, 'uncategorized', '缺类别应落到未分类');

// 合并：重复上报只留一条
const one = normalizeExpense({ id: 'e1', amountCents: 1800, merchant: '瑞幸咖啡', postedAt: t, source: 'wechat', category: 'food' });
const dup = normalizeExpense({ id: 'e2', amountCents: 1800, merchant: '瑞幸咖啡', postedAt: t, source: 'wechat', category: 'food' });
const merged = mergeExpenses([one], [dup]);
eq(merged.length, 1, '重复上报应合并为一条');
eq(merged[0].id, 'e1', '合并应保留原 id');

// 人工修正不被自动分类覆盖
const pinned = { ...one, category: 'entertainment', categoryPinned: true };
const reclassified = { ...dup, category: 'food' };
eq(mergeExpenses([pinned], [reclassified])[0].category, 'entertainment', '人工修正的类别不应被后续自动分类覆盖');

// 月度分片
const month = normalizeExpenseMonth({
  month: '2026-06',
  expenses: [one, dup, { id: 'bad', amountCents: -5 }],
});
eq(month.expenses.length, 1, '月度分片应归一化并去重，丢弃坏条目');

// 汇总：各类别之和 == 总额
const sum = summarizeExpenses('2026-06', [
  one,
  { ...one, id: 'e3', dedupeKey: 'k3', amountCents: 500, category: 'transport', merchant: '地铁' },
  { ...one, id: 'e4', dedupeKey: 'k4', amountCents: 300, category: 'uncategorized', merchant: '?' },
]);
eq(sum.totalCents, 2600, '总额应为 1800+500+300');
eq(
  sum.byCategory.reduce((s, c) => s + c.amountCents, 0),
  sum.totalCents,
  '各类别之和必须等于月度总额',
);
eq(sum.byCategory[0].category, 'food', '类别应按金额降序');
eq(Math.round(sum.byCategory[0].share * 100), Math.round((1800 / 2600) * 100), '占比计算');
eq(sum.count, 3, '记录数');

// 规则归一化
const rules = normalizeExpenseRules({ rules: { 瑞幸咖啡: 'food', '  星巴克 ': 'food', 乱来: 'not-a-category' } });
eq(Object.keys(rules.rules).length, 2, '非法类别值应被丢弃');
eq(rules.rules['星巴克'], 'food', '规则键应做商户归一化');

/* ══════════════════ 5. 支付通知解析 ══════════════════ */

/*
 * ⚠️ 下面这些通知文本是**按微信/支付宝公开的常见形态构造的**，不是真机原文。
 * 真机原文尚未回传（见 tasks 2.7 / 9.10）。因此本组断言验证的是**解析器的行为**
 * （能否拒绝、能否抽取、幂等是否生效），而不是"这些文案一定长这样"。
 * 拿到真实样本后，应把它们补进这里作为回归夹具。
 */
const WECHAT = 'com.tencent.mm';
const ALIPAY = 'com.eg.android.AlipayGphone';
const srcOf = (pkg) => (pkg === WECHAT ? 'wechat' : pkg === ALIPAY ? 'alipay' : null);
const at = '2026-06-13T10:30:15.000Z';
const n = (title, text, pkg = WECHAT, postedAt = at) => ({ title, text, pkg, postedAt });

// ── 成功解析 ──
let r = parsePayments([n('微信支付', '微信支付 收款方：瑞幸咖啡  ¥18.00')], srcOf);
eq(r.parsed.length, 1, '应解析出一条支出');
eq(r.parsed[0].amountCents, 1800, '金额应转为分（整数）');
eq(r.parsed[0].merchant, '瑞幸咖啡', '应从「收款方」抽出商户');
eq(r.parsed[0].source, 'wechat', '渠道应取包名');

r = parsePayments([n('支付宝', '支付宝 付款成功 18.00元 商户：全家便利店', ALIPAY)], srcOf);
eq(r.parsed.length, 1, '支付宝应解析出一条');
eq(r.parsed[0].amountCents, 1800, '「18.00元」形态应被识别');
eq(r.parsed[0].merchant, '全家便利店', '应从「商户」抽出商户');

// 无商户标签时不该猜——merchant 允许为空，但**不能**把整行当商户
r = parsePayments([n('微信支付', '向 星巴克 付款 ¥35.50')], srcOf);
eq(r.parsed.length, 1, '「向 X 付款」应能识别');
eq(r.parsed[0].amountCents, 3550, '金额 35.50 应转 3550 分');
eq(r.parsed[0].merchant, '星巴克', '应从「向 X 付款」抽出商户');

// 浮点边界：18.10 * 100 在 IEEE754 下是 1809.9999…
r = parsePayments([n('微信支付', '微信支付 收款方：A店  ¥18.10')], srcOf);
eq(r.parsed[0].amountCents, 1810, '18.10 应精确转为 1810 分，不能因浮点变成 1809');

// ── 拒绝规则（9.2）──
const rejectedAs = (title, text, expect) => {
  const out = parsePayments([n(title, text)], srcOf);
  eq(out.parsed.length, 0, `${expect} 不应产生支出记录`);
  eq(out.rejected[expect], 1, `${expect} 应被计入拒绝原因`);
};
rejectedAs('微信支付', '微信支付 退款到账 ¥18.00', 'refund');
rejectedAs('微信支付', '转账给 张三 ¥100.00', 'transfer');
rejectedAs('微信支付', '收款成功 ¥50.00', 'income');
rejectedAs('微信支付', '零钱余额变动 ¥20.00', 'balance');
rejectedAs('微信支付', '优惠券到账 满20减5', 'coupon');
rejectedAs('微信支付', '支付失败 ¥18.00', 'failed');

// **顺序验证**：「退款 ¥18.00」若先抽金额再判拒绝，会被记成一笔支出（把收入记成支出）
r = parsePayments([n('微信支付', '微信支付 退款到账 ¥18.00 收款方：瑞幸咖啡')], srcOf);
eq(r.parsed.length, 0, '退款即便含完整金额与商户也必须被拒绝');
eq(r.unparsed.length, 0, '退款不算"无法识别"，应算被拒绝');

// ── 无法识别（9.4）──
r = parsePayments([n('微信支付', '微信支付 你有一条新消息')], srcOf);
eq(r.parsed.length, 0, '无金额不应产生记录');
eq(r.unparsed.length, 1, '无法识别的通知应进入待修正而不是被丢弃');
assert(r.unparsed[0].notification.text.includes('新消息'), '待修正应保留原始通知供审计');

// 裸数字不该被当金额（订单号、时间）
r = parsePayments([n('微信支付', '微信支付 订单号 12345678 12:30')], srcOf);
eq(r.parsed.length, 0, '无小数点的裸数字不应被当成金额');

// 非声明渠道应被忽略（不走解析）
r = parsePayments([n('某银行', '消费 ¥99.00', 'com.example.bank')], srcOf);
eq(r.parsed.length + r.unparsed.length + Object.keys(r.rejected).length, 0, '非声明渠道应直接忽略');

// ── 批内幂等（9.3）──
r = parsePayments(
  [
    n('微信支付', '微信支付 收款方：瑞幸咖啡  ¥18.00', WECHAT, '2026-06-13T10:30:15.000Z'),
    n('微信支付', '支付成功 ¥18.00 收款方：瑞幸咖啡', WECHAT, '2026-06-13T10:30:40.000Z'),
  ],
  srcOf,
);
eq(r.parsed.length, 1, '同一笔支付的重复推送应在批内合并为一条');
eq(r.dedupedInBatch, 1, '应记录批内去重条数（用于观察重复率）');

// 跨分钟的同额同商户应保留为两笔
r = parsePayments(
  [
    n('微信支付', '微信支付 收款方：瑞幸咖啡  ¥18.00', WECHAT, '2026-06-13T10:30:15.000Z'),
    n('微信支付', '微信支付 收款方：瑞幸咖啡  ¥18.00', WECHAT, '2026-06-13T11:05:00.000Z'),
  ],
  srcOf,
);
eq(r.parsed.length, 2, '跨分钟的同额同商户应视为两笔');

// 解析结果可直接入库
const batch = parsePayments([n('微信支付', '微信支付 收款方：瑞幸咖啡  ¥18.00')], srcOf);
const asExpense = normalizeExpense({
  id: 'e-parsed',
  amountCents: batch.parsed[0].amountCents,
  merchant: batch.parsed[0].merchant,
  postedAt: batch.parsed[0].postedAt,
  source: batch.parsed[0].source,
  dedupeKey: batch.parsed[0].dedupeKey,
});
assert(asExpense !== null, '解析结果应能直接通过 normalizeExpense 校验');
eq(asExpense.dedupeKey, batch.parsed[0].dedupeKey, '解析出的幂等键应被保留');

console.log(`✓ 全部通过（${count} 项断言）`);
