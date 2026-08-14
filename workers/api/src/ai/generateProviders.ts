import type {
  AiAttachment,
  AiGenerateRequest,
  AiGenerateResult,
  AiMediaKind,
  AiProviderInfo,
  AiProvidersResponse,
} from '@webbook/shared';
import { CF_FLUX_2_KLEIN, CF_FLUX_SCHNELL, SEEDANCE_DEFAULT_PARAMS } from '@webbook/shared';
import type { Env } from '../env';
import type { AuthUser } from '../auth';
import { resolveAssetBytes } from '../assets';
import { generateDeepseekText } from './adapters/deepseekText';
import { generateCfWorkersAiImage } from './adapters/cfWorkersAiImage';
import { generateSeedreamImage } from './adapters/seedreamImage';
import { generateGeminiImage } from './adapters/geminiImage';
import { generateOpenAiImage } from './adapters/openaiImage';
import { createAsyncAiJob, jobToGenerateKind } from './jobs';

function hasDeepseek(env: Env): boolean {
  return Boolean(env.AI_API_KEY?.trim());
}

function hasCfWorkersAi(env: Env): boolean {
  return Boolean(env.AI) || Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
}

function hasVolc(env: Env): boolean {
  return Boolean(env.VOLC_API_KEY?.trim());
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

/** 根据当前 Secrets / bindings 列出可用与占位 provider */
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
      label: 'Cloudflare Workers AI',
      kind: 'image',
      available: hasCfWorkersAi(env),
      reason: hasCfWorkersAi(env)
        ? undefined
        : 'missing_binding:AI 或 CLOUDFLARE_ACCOUNT_ID+TOKEN',
      defaultModel: CF_FLUX_SCHNELL,
      models: [
        {
          id: CF_FLUX_SCHNELL,
          label: 'FLUX.1 Schnell（纯文生图）',
          supportsReferenceImages: false,
          qualities: [
            { id: 'fast', label: '快速' },
            { id: 'standard', label: '标准' },
          ],
        },
        {
          id: CF_FLUX_2_KLEIN,
          label: 'FLUX.2 Klein（可参考图）',
          supportsReferenceImages: true,
        },
      ],
    },
    {
      id: 'seedream',
      label: 'Seedream（火山）',
      kind: 'image',
      available: hasVolc(env),
      reason: hasVolc(env) ? undefined : 'missing_secret:VOLC_API_KEY',
      defaultModel: 'doubao-seedream-4.0',
      models: [
        { id: 'doubao-seedream-4.0', label: 'Seedream 4.0' },
        { id: 'doubao-seedream-4-5-251128', label: 'Seedream 4.5' },
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
      id: 'seedance',
      label: 'Seedance（火山）',
      kind: 'video',
      available: hasVolc(env),
      reason: hasVolc(env) ? undefined : 'missing_secret:VOLC_API_KEY',
      defaultModel: 'doubao-seedance-1-0-lite-t2v',
      async: true,
      models: [
        { id: 'doubao-seedance-1-0-lite-t2v', label: 'Seedance Lite T2V' },
        { id: 'doubao-seedance-1-0-pro-t2v', label: 'Seedance Pro T2V' },
      ],
    },
    {
      id: 'tripo',
      label: 'Tripo3D',
      kind: 'model3d',
      available: hasTripo(env),
      reason: hasTripo(env) ? undefined : 'missing_secret:TRIPO_API_KEY',
      defaultModel: 'turbo',
      async: true,
      models: [{ id: 'turbo', label: 'Turbo' }],
    },
    {
      id: 'audio-stub',
      label: '音乐生成（待选供应商）',
      kind: 'audio',
      available: false,
      reason: 'music_provider_undecided',
      defaultModel: 'tbd',
      models: [{ id: 'tbd', label: '待接入' }],
    },
  ];

  const defaults: Partial<Record<AiMediaKind, string>> = {};
  const prefer: Record<AiMediaKind, string[]> = {
    text: ['deepseek'],
    image: ['seedream', 'gemini-image', 'openai-image', 'cf-workers-ai'],
    video: ['seedance'],
    model3d: ['tripo'],
    audio: ['audio-stub'],
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

async function loadAttachmentBytes(
  env: Env,
  user: AuthUser,
  att: AiAttachment,
): Promise<Uint8Array> {
  const url = att.url?.trim();
  if (!url) throw new Error(`attachment ${att.label} missing url`);
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error(`attachment ${att.label} bad data URL`);
    return Uint8Array.from(atob(m[2]!), (c) => c.charCodeAt(0));
  }
  const asset = url.match(/\/api\/assets\/(?:(vol-[\w.-]+)\/)?([^/?#]+)/i);
  if (asset) {
    const volumeId = asset[1] ?? null;
    const name = asset[2]!;
    const bytes = await resolveAssetBytes(env, name, user, volumeId);
    if (!bytes) throw new Error(`attachment ${att.label} asset not found`);
    return bytes;
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`attachment ${att.label} fetch ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error(`attachment ${att.label} unsupported url`);
}

export async function runAiGenerate(
  env: Env,
  req: AiGenerateRequest,
  saveAsset: (bytes: Uint8Array, mime: string) => Promise<string>,
  user: AuthUser,
): Promise<AiGenerateResult> {
  const prompt = req.prompt?.trim();
  if (!prompt) {
    return { kind: 'error', code: 'bad_request', message: 'prompt required' };
  }

  const attachments = (req.attachments ?? []).filter((a) => a.kind === 'image' && a.url);
  let providerId = req.provider;
  let modelId = req.model;

  if (req.kind === 'image' && attachments.length > 0) {
    providerId = 'cf-workers-ai';
    modelId = CF_FLUX_2_KLEIN;
  }

  const info = findProvider(env, providerId);
  if (!info) {
    return { kind: 'error', code: 'bad_request', message: `unknown provider: ${providerId}` };
  }
  if (info.kind !== req.kind) {
    return {
      kind: 'error',
      code: 'bad_request',
      message: `provider ${providerId} does not support kind ${req.kind}`,
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
    if (providerId === 'deepseek' && req.kind === 'text') {
      const text = await generateDeepseekText(env, prompt, modelId);
      return { kind: 'text', text, provider: providerId, model: modelId };
    }

    if (req.kind === 'image') {
      let bytes: Uint8Array;
      let mime: string;
      let modelUsed = modelId;
      if (providerId === 'cf-workers-ai') {
        const refBytes: Uint8Array[] = [];
        for (const att of attachments.slice(0, 4)) {
          refBytes.push(await loadAttachmentBytes(env, user, att));
        }
        const out = await generateCfWorkersAiImage(
          env,
          prompt,
          modelId,
          req.quality,
          refBytes,
        );
        bytes = out.bytes;
        mime = out.mime;
        modelUsed = out.modelUsed;
      } else if (providerId === 'seedream') {
        const out = await generateSeedreamImage(env, prompt, modelId, {
          size: req.params?.size || req.quality,
        });
        bytes = out.bytes;
        mime = out.mime;
      } else if (providerId === 'gemini-image') {
        const out = await generateGeminiImage(env, prompt, modelId);
        bytes = out.bytes;
        mime = out.mime;
      } else if (providerId === 'openai-image') {
        const out = await generateOpenAiImage(env, prompt, modelId);
        bytes = out.bytes;
        mime = out.mime;
      } else {
        return {
          kind: 'error',
          code: 'not_implemented',
          message: `image provider ${providerId} not implemented`,
        };
      }
      const url = await saveAsset(bytes, mime);
      return { kind: 'image', url, provider: providerId, model: modelUsed };
    }

    if (providerId === 'seedance' && req.kind === 'video') {
      const params = { ...SEEDANCE_DEFAULT_PARAMS, ...req.params, watermark: false };
      const job = await createAsyncAiJob(env, user, {
        kind: 'video',
        provider: 'seedance',
        model: modelId,
        prompt,
        params: params as unknown as Record<string, unknown>,
      });
      return jobToGenerateKind(job);
    }

    if (providerId === 'tripo' && req.kind === 'model3d') {
      const job = await createAsyncAiJob(env, user, {
        kind: 'model3d',
        provider: 'tripo',
        model: modelId,
        prompt,
      });
      return jobToGenerateKind(job);
    }

    if (req.kind === 'audio') {
      return {
        kind: 'error',
        code: 'not_implemented',
        message: '音乐供应商尚未选定；可先导入本地音频',
      };
    }

    return {
      kind: 'error',
      code: 'not_implemented',
      message: `provider ${providerId} not implemented`,
    };
  } catch (err) {
    return {
      kind: 'error',
      code: 'upstream',
      message: (err as Error).message || 'upstream error',
    };
  }
}
