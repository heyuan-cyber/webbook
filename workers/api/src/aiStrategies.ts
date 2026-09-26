import type { Env } from './env';
import { getFile, putFile } from './github';
import type { AIStrategiesConfig, AIStrategy } from '@webbook/shared';
import { AI_STRATEGIES_PATH } from '@webbook/shared';

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
 * 目前没有已落地的 cron 动作：'classify' 需要模型侧实现，'summarize' 走 on_save 触发。
 * 因此本函数只做登记判断并直接返回；新增 cron 动作时在这里分派。
 */
export async function runCronStrategies(env: Env): Promise<void> {
  const config = await loadAiStrategies(env);
  const cronJobs = config.strategies.filter((s) => s.enabled && s.trigger === 'cron');
  if (!cronJobs.length) return;
  // 无已实现动作：显式空实现，避免留下永不执行的循环
}
