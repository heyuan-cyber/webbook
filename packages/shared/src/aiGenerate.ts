/** 画板节点内 AI 生成框架类型（与策略引擎 ai.ts 分离）。 */

export type AiMediaKind = 'text' | 'image' | 'video' | 'model3d' | 'audio';

export type AiGenSource = 'ai' | 'upload' | 'url' | 'manual';

export type AiGenStatus = 'idle' | 'running' | 'done' | 'error';

/** 挂在 paragraph / image / video 等块上的生成状态（可选，旧笔记无此字段） */
export interface BlockAiState {
  prompt?: string;
  provider?: string;
  model?: string;
  quality?: string;
  status?: AiGenStatus;
  error?: string;
  source?: AiGenSource;
}

export interface AiProviderModelOption {
  id: string;
  label: string;
  /** 精度/尺寸等可选项 */
  qualities?: { id: string; label: string }[];
}

export interface AiProviderInfo {
  id: string;
  label: string;
  kind: AiMediaKind;
  /** 密钥/绑定已配置时可真正调用 */
  available: boolean;
  /** 不可用原因，如 missing_secret */
  reason?: string;
  defaultModel?: string;
  models: AiProviderModelOption[];
}

export interface AiProvidersResponse {
  providers: AiProviderInfo[];
  /** 各 kind 的默认 provider id（仅当 available） */
  defaults: Partial<Record<AiMediaKind, string>>;
}

export interface AiGenerateRequest {
  kind: AiMediaKind;
  provider: string;
  model: string;
  prompt: string;
  quality?: string;
}

export type AiGenerateResult =
  | { kind: 'text'; text: string; provider: string; model: string }
  | { kind: 'image'; url: string; provider: string; model: string }
  | { kind: 'video'; url: string; provider: string; model: string }
  | {
      kind: 'error';
      code: 'provider_unavailable' | 'bad_request' | 'upstream' | 'not_implemented';
      message: string;
    };
