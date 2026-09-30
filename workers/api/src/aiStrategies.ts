import type { Env } from './env';
import { getFile, putFile } from './github';
import type { AIStrategiesConfig, AIStrategy } from '@webbook/shared';
import { AI_STRATEGIES_PATH } from '@webbook/shared';
import { listKnownUserIds } from './usersRegistry';
import { loadExpenseMonth } from './tracking';

const DEFAULT_STRATEGIES: AIStrategy[] = [
  {
    id: 'on-save-summary',
    name: '写完即总结',
    enabled: false,
    trigger: 'on_save',
    scope: { kind: 'note' },
    actions: ['summarize'],
  },
  {
    id: 'nightly-tidy',
    name: '每晚整理',
    enabled: true,
    trigger: 'cron',
    cron: '0 2 * * *',
    scope: { kind: 'all' },
    actions: ['classify'],
  },
  {
    // native-android-companion：把上月消费汇总成一篇 private 笔记。
    // 默认关闭——需要模型调用，不该在用户没选择时消耗配额。
    id: 'monthly-expense-report',
    name: '消费月报',
    enabled: false,
    trigger: 'cron',
    cron: '0 1 1 * *',
    scope: { kind: 'all' },
    actions: ['monthly_expense_report'],
  },
];

export async function loadAiStrategies(env: Env): Promise<AIStrategiesConfig> {
  const raw = await getFile(env, AI_STRATEGIES_PATH);
  if (!raw) return { schemaVersion: 1, strategies: DEFAULT_STRATEGIES };
  const data = JSON.parse(raw) as AIStrategiesConfig;
  return {
    schemaVersion: 1,
    strategies: Array.isArray(data.strategies) ? data.strategies : DEFAULT_STRATEGIES,
  };
}

export async function saveAiStrategies(env: Env, config: AIStrategiesConfig): Promise<void> {
  await putFile(env, AI_STRATEGIES_PATH, JSON.stringify(config, null, 2), 'meta: ai strategies');
}

/**
 * Workers Cron：执行已启用的 cron 策略。
 *
 * 任务只从规划弹窗创建（design D8）——这里不再从笔记正文抽取待办，
 * `extract_todos` 动作已随 reminders 一并下线。
 *
 * 目前只有 `monthly_expense_report` 有分派；`classify` 仍待模型侧实现。
 * 未实现的动作在这里**显式跳过**，不静默做事。
 */
export async function runCronStrategies(env: Env): Promise<void> {
  const config = await loadAiStrategies(env);
  const cronJobs = config.strategies.filter((s) => s.enabled && s.trigger === 'cron');
  if (!cronJobs.length) return;

  const wantsMonthlyReport = cronJobs.some((j) =>
    j.actions.includes('monthly_expense_report'),
  );

  if (wantsMonthlyReport) {
    // 日期门控：worker 的 cron 是每天触发的，月报只应在月初生成一次。
    // 允许 1–3 号，容忍 cron 漂移与月初的短暂故障。
    const day = new Date().getUTCDate();
    if (day <= 3) {
      await runMonthlyExpenseReports(env);
    }
  }

  // 'classify' 尚未实现：留空而不假装执行
}

/** 报告要覆盖的月份：上个月 */
function previousMonthUtc(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * 为每个有消费数据的用户生成上月消费报告。
 *
 * ⚠️ **AI 生成部分尚未实现**，见 tasks 4.12b。当前函数只完成用户遍历与月份选择，
 * 不做模型调用——因此"策略被启用"暂时不会产生任何副作用。
 * 这样安排是刻意的：分派骨架先就位，生成逻辑作为独立任务实现，
 * 避免把模型调用、报告落点、失败重试混在一次改动里。
 */
export async function runMonthlyExpenseReports(env: Env): Promise<void> {
  const month = previousMonthUtc();
  const userIds = await listKnownUserIds(env);
  for (const userId of userIds) {
    const doc = await loadExpenseMonth(env, userId, month);
    // 无数据不生成报告——避免给每个用户都写一篇空笔记
    if (doc.expenses.length === 0) continue;
    // TODO(tasks 4.12b): 汇总 → 调 chat() 生成洞察 → 写成一篇 private 笔记
  }
}
