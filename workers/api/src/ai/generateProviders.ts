import type {
  AiGenerateRequest,
  AiGenerateResult,
  AiMediaKind,
  AiProviderInfo,
  AiProvidersResponse,
} from '@webbook/shared';
import type { Env } from '../env';
import { generateDeepseekText } from './adapters/deepseekText';
import { generateCfWorkersAiImage } from './adapters/cfWorkersAiImage';

function hasDeepseek(env: Env): boolean {
  return Boolean(env.AI_API_KEY?.trim());
}

function hasCfWorkersAi(env: Env): boolean {
  return Boolean(env.AI) || Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
}

function hasVolcSeedance(env: Env): boolean {
  return Boolean(
    (env.VOLC_ACCESS_KEY_ID && env.VOLC_SECRET_ACCESS_KEY) || env.VOLC_API_KEY?.trim(),
  );
}

function hasGemini(env: Env): boolean {
  return Boolean(env.GEMINI_API_KEY?.trim());
}

function hasOpenAI(env: Env): boolean {
  return Boolean(env.OPENAI_API_KEY?.trim());
}

function hasTripo(env: Env): boolean {
  return Boolean(env.TRIPO_API_KEY?.trim());
}

/** 根据当前 Secrets / bindings 列出可用与占位 provider（无 Key 也返回，available=false） */
export function listAiProviders(env: Env): AiProvidersResponse {
  const providers: AiProviderInfo[] = [
    {
      id: 'deepseek',
      label: 'DeepSeek',
      kind: 'text',
      available: hasDeepseek(env),
      reason: hasDeepseek(env) ? undefined : 'missing_secret:AI_API_KEY',
      defaultModel: env.AI_MODEL || 'deepseek-chat',
      models: [
        {
          id: env.AI_MODEL || 'deepseek-chat',
          label: env.AI_MODEL || 'deepseek-chat',
        },
      ],
    },
    {
      id: 'cf-workers-ai',
      label: 'Cloudflare Workers AI（免费）',
      kind: 'image',
      available: hasCfWorkersAi(env),
      reason: hasCfWorkersAi(env)
        ? undefined
        : 'missing_binding:AI 或 CLOUDFLARE_ACCOUNT_ID+CLOUDFLARE_API_TOKEN',
      defaultModel: '@cf/black-forest-labs/flux-1-schnell',
      models: [
        {
          id: '@cf/black-forest-labs/flux-1-schnell',
          label: 'FLUX.1 Schnell',
          qualities: [
            { id: 'fast', label: '快速' },
            { id: 'standard', label: '标准' },
          ],
        },
      ],
    },
    {
      id: 'gemini-image',
      label: 'Gemini 生图',
      kind: 'image',
      available: hasGemini(env),
      reason: hasGemini(env) ? undefined : 'missing_secret:GEMINI_API_KEY',
      defaultModel: 'gemini-2.0-flash-preview-image-generation',
      models: [
        {
          id: 'gemini-2.0-flash-preview-image-generation',
          label: 'Gemini Image',
        },
      ],
    },
    {
      id: 'openai-image',
      label: 'GPT Image',
      kind: 'image',
      available: hasOpenAI(env),
      reason: hasOpenAI(env) ? undefined : 'missing_secret:OPENAI_API_KEY',
      defaultModel: 'gpt-image-1',
      models: [{ id: 'gpt-image-1', label: 'gpt-image-1' }],
    },
    {
      id: 'seedream',
      label: 'Seedream（火山）',
      kind: 'image',
      available: hasVolcSeedance(env),
      reason: hasVolcSeedance(env)
        ? undefined
        : 'missing_secret:VOLC_ACCESS_KEY_ID+VOLC_SECRET_ACCESS_KEY 或 VOLC_API_KEY',
      defaultModel: 'seedream-4.0',
      models: [{ id: 'seedream-4.0', label: 'Seedream 4.0' }],
    },
    {
      id: 'seedance',
      label: 'Seedance（火山）',
      kind: 'video',
      available: hasVolcSeedance(env),
      reason: hasVolcSeedance(env)
        ? undefined
        : 'missing_secret:VOLC_ACCESS_KEY_ID+VOLC_SECRET_ACCESS_KEY 或 VOLC_API_KEY',
      defaultModel: 'seedance-1-0-lite-t2v',
      models: [
        { id: 'seedance-1-0-lite-t2v', label: 'Seedance Lite T2V' },
      ],
    },
    {
      id: 'tripo',
      label: 'Tripo3D',
      kind: 'model3d',
      available: hasTripo(env),
      reason: hasTripo(env) ? undefined : 'missing_secret:TRIPO_API_KEY',
      defaultModel: 'turbo',
      models: [{ id: 'turbo', label: 'Turbo' }],
    },
  ];

  const defaults: Partial<Record<AiMediaKind, string>> = {};
  const prefer: Record<AiMediaKind, string[]> = {
    text: ['deepseek'],
    image: ['cf-workers-ai', 'gemini-image', 'seedream', 'openai-image'],
    video: ['seedance'],
    model3d: ['tripo'],
    audio: [],
  };
  for (const kind of Object.keys(prefer) as AiMediaKind[]) {
    const hit = prefer[kind].find((id) => providers.some((p) => p.id === id && p.available));
    if (hit) defaults[kind] = hit;
  }

  return { providers, defaults };
}

export function findProvider(env: Env, providerId: string): AiProviderInfo | undefined {
  return listAiProviders(env).providers.find((p) => p.id === providerId);
}

export async function runAiGenerate(
  env: Env,
  req: AiGenerateRequest,
  saveImage: (bytes: Uint8Array, mime: string) => Promise<string>,
): Promise<AiGenerateResult> {
  const prompt = req.prompt?.trim();
  if (!prompt) {
    return { kind: 'error', code: 'bad_request', message: 'prompt required' };
  }

  const info = findProvider(env, req.provider);
  if (!info) {
    return { kind: 'error', code: 'bad_request', message: `unknown provider: ${req.provider}` };
  }
  if (info.kind !== req.kind) {
    return {
      kind: 'error',
      code: 'bad_request',
      message: `provider ${req.provider} does not support kind ${req.kind}`,
    };
  }
  if (!info.available) {
    return {
      kind: 'error',
      code: 'provider_unavailable',
      message: info.reason || 'provider not configured',
    };
  }

  try {
    if (req.provider === 'deepseek' && req.kind === 'text') {
      const text = await generateDeepseekText(env, prompt, req.model);
      return { kind: 'text', text, provider: req.provider, model: req.model };
    }
    if (req.provider === 'cf-workers-ai' && req.kind === 'image') {
      const { bytes, mime } = await generateCfWorkersAiImage(env, prompt, req.model, req.quality);
      const url = await saveImage(bytes, mime);
      return { kind: 'image', url, provider: req.provider, model: req.model };
    }
    // 占位：密钥配齐后再实现
    if (
      ['gemini-image', 'openai-image', 'seedream', 'seedance', 'tripo'].includes(req.provider)
    ) {
      return {
        kind: 'error',
        code: 'not_implemented',
        message: `provider ${req.provider} 适配器待接入（密钥已检测到时可继续开发）`,
      };
    }
    return {
      kind: 'error',
      code: 'not_implemented',
      message: `provider ${req.provider} not implemented`,
    };
  } catch (err) {
    return {
      kind: 'error',
      code: 'upstream',
      message: (err as Error).message || 'upstream error',
    };
  }
}
