/** 画板节点内 AI 生成框架类型（与策略引擎 ai.ts 分离）。 */

export type AiMediaKind = 'text' | 'image' | 'video' | 'model3d' | 'audio';

export type AiGenSource = 'ai' | 'upload' | 'url' | 'manual';

export type AiGenStatus = 'idle' | 'running' | 'submitted' | 'done' | 'error';

/** 提示词中 @ 引用的素材（笔记块或输入框粘贴） */
export interface AiAttachment {
  id: string;
  kind: 'image' | 'video';
  /** 展示名，对应 prompt 里的 @label */
  label: string;
  /** /api/assets/... 或 https；发送前应已可被 Worker 拉取 */
  url: string;
  /** 来源：笔记块 id，或 paste */
  source?: 'note-block' | 'paste';
  blockId?: string;
}

/** 视频 / 3D / 音频等生成参数（按 kind 选用字段） */
export interface AiGenParams {
  /** 视频时长秒 */
  duration?: number;
  /** 720p | 1080p 等 */
  resolution?: string;
  /** 16:9 | 9:16 | 1:1 */
  ratio?: string;
  /** 是否生成音频轨（Seedance） */
  generateAudio?: boolean;
  /** 强制无水印（付费 API） */
  watermark?: boolean;
  /** 生图尺寸提示：2K / 1024x1024 */
  size?: string;
}

/** 挂在 paragraph / image / video / model3d / audio 等块上的生成状态 */
export interface BlockAiState {
  prompt?: string;
  provider?: string;
  model?: string;
  quality?: string;
  status?: AiGenStatus;
  error?: string;
  source?: AiGenSource;
  attachments?: AiAttachment[];
  params?: AiGenParams;
  /** 异步任务 id（Worker 侧） */
  jobId?: string;
}

export interface AiProviderModelOption {
  id: string;
  label: string;
  /** 是否支持参考图（multipart input_image_*） */
  supportsReferenceImages?: boolean;
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
  /** 是否异步（需轮询 job） */
  async?: boolean;
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
  /** 参考素材（生图有附件时强制 FLUX.2） */
  attachments?: AiAttachment[];
  params?: AiGenParams;
}

export type AiJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface AiJobRecord {
  id: string;
  userId: string;
  kind: AiMediaKind;
  provider: string;
  model: string;
  prompt: string;
  status: AiJobStatus;
  providerTaskId?: string;
  error?: string;
  /** 完成后的主资源 URL（/api/assets/...） */
  resultUrl?: string;
  /** 3D 预览图 */
  posterUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type AiGenerateResult =
  | { kind: 'text'; text: string; provider: string; model: string }
  | { kind: 'image'; url: string; provider: string; model: string }
  | { kind: 'video'; url: string; provider: string; model: string }
  | {
      kind: 'model3d';
      url: string;
      posterUrl?: string;
      provider: string;
      model: string;
    }
  | { kind: 'audio'; url: string; provider: string; model: string }
  | {
      kind: 'job';
      jobId: string;
      provider: string;
      model: string;
      status: AiJobStatus;
    }
  | {
      kind: 'error';
      code: 'provider_unavailable' | 'bad_request' | 'upstream' | 'not_implemented';
      message: string;
    };

export const CF_FLUX_SCHNELL = '@cf/black-forest-labs/flux-1-schnell';
/** 支持最多 4 张参考图的较快 FLUX.2 */
export const CF_FLUX_2_KLEIN = '@cf/black-forest-labs/flux-2-klein-4b';

/** Seedance 默参（最低成本） */
export const SEEDANCE_DEFAULT_PARAMS: AiGenParams = {
  duration: 5,
  resolution: '720p',
  ratio: '16:9',
  generateAudio: false,
  watermark: false,
};
