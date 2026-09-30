/** 可配置、可扩展的 AI 策略引擎类型。 */

export type StrategyTrigger = 'on_save' | 'cron' | 'manual' | 'on_login';

/**
 * 可执行的策略动作。
 *
 * `monthly_expense_report` 由 native-android-companion 引入：按月汇总消费并生成洞察，
 * 结果写成一篇 private 笔记。默认关闭——它需要模型调用，不该在用户没选择时消耗配额。
 */
export type StrategyActionType =
  | 'summarize'
  | 'classify'
  | 'merge_tags'
  | 'monthly_expense_report';

export type StrategyScope =
  | { kind: 'note' } // 当前笔记
  | { kind: 'all' } // 全库
  | { kind: 'folder'; folderId: string }; // 指定栏目

export interface AIStrategy {
  id: string;
  name: string;
  enabled: boolean;
  trigger: StrategyTrigger;
  /** cron 表达式，仅 trigger=cron 时使用 */
  cron?: string;
  scope: StrategyScope;
  actions: StrategyActionType[];
}

export interface AIStrategiesConfig {
  schemaVersion: number;
  strategies: AIStrategy[];
}
