import type { Env } from './env';
import { getFile, putFile } from './github';
import type { AIStrategiesConfig, AIStrategy, TreeNode } from '@webbook/shared';
import { AI_STRATEGIES_PATH } from '@webbook/shared';
import { listKnownUserIds } from './usersRegistry';
import { loadUserTree, loadUserNote } from './userData';
import { mergeTodosFromNote } from './reminders';

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
    name: '每晚整理 + TODO 提取',
    enabled: true,
    trigger: 'cron',
    cron: '0 2 * * *',
    scope: { kind: 'all' },
    actions: ['classify', 'extract_todos'],
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

function collectNoteIds(nodes: TreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'note') ids.push(node.noteId ?? node.id);
    if (node.children?.length) ids.push(...collectNoteIds(node.children));
  }
  return ids;
}

/** Workers Cron：执行已启用的 cron 策略 */
export async function runCronStrategies(env: Env): Promise<void> {
  const config = await loadAiStrategies(env);
  const cronJobs = config.strategies.filter((s) => s.enabled && s.trigger === 'cron');
  if (!cronJobs.length) return;

  const userIds = await listKnownUserIds(env);
  for (const userId of userIds) {
    const tree = await loadUserTree(env, userId);
    const noteIds = collectNoteIds(tree.roots);
    for (const noteId of noteIds) {
      const note = await loadUserNote(env, userId, noteId);
      if (!note) continue;
      for (const job of cronJobs) {
        if (job.actions.includes('extract_todos')) {
          await mergeTodosFromNote(env, userId, note);
        }
      }
    }
  }
}
