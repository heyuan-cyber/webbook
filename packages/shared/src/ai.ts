/** 可配置、可扩展的 AI 策略引擎类型。 */

export type StrategyTrigger = 'on_save' | 'cron' | 'manual' | 'on_login';

export type StrategyActionType = 'summarize' | 'classify' | 'merge_tags';

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
