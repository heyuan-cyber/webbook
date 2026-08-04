import { useEffect, useMemo, useState } from 'react';
import type {
  AiMediaKind,
  AiProviderInfo,
  AiProvidersResponse,
  BlockAiState,
} from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiClient } from '@/lib/api';

interface Props {
  kind: Extract<AiMediaKind, 'text' | 'image' | 'video'>;
  ai?: BlockAiState;
  onAiChange: (next: BlockAiState) => void;
  onTextResult?: (text: string) => void;
  onImageResult?: (url: string) => void;
  onVideoResult?: (url: string) => void;
  /** 本地导入（图片/视频） */
  onImport?: () => void;
  importLabel?: string;
  style?: React.CSSProperties;
}

let providersCache: AiProvidersResponse | null = null;
let providersInflight: Promise<AiProvidersResponse> | null = null;

async function loadProviders(token: string): Promise<AiProvidersResponse> {
  if (providersCache) return providersCache;
  if (!providersInflight) {
    providersInflight = apiClient.aiProviders(token).then((r: AiProvidersResponse) => {
      providersCache = r;
      return r;
    });
  }
  const res = await providersInflight;
  providersInflight = null;
  return res;
}

function promptPlaceholder(kind: Props['kind']): string {
  if (kind === 'image') return '描述要生成的图片…';
  if (kind === 'video') return '描述要生成的视频…';
  return '描述要生成的文字…';
}

function hintFor(kind: Props['kind']): string {
  if (kind === 'image') return '也可点「导入」选本地图片；无 Key 时可选手传';
  if (kind === 'video') return '也可导入本地视频或填写 URL；生视频需配置火山等密钥';
  return '也可直接手写 Markdown';
}

export function BlockAiPanel({
  kind,
  ai,
  onAiChange,
  onTextResult,
  onImageResult,
  onVideoResult,
  onImport,
  importLabel = '导入',
  style,
}: Props) {
  const { session, isGuest } = useAuth();
  const [providers, setProviders] = useState<AiProviderInfo[]>(providersCache?.providers ?? []);
  const [defaults, setDefaults] = useState(providersCache?.defaults ?? {});
  const [loadingList, setLoadingList] = useState(!providersCache);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isGuest || !session?.token) {
      setLoadingList(false);
      setListError(null);
      return;
    }
    let cancelled = false;
    setLoadingList(true);
    setListError(null);
    loadProviders(session.token)
      .then((res) => {
        if (cancelled) return;
        setProviders(res.providers);
        setDefaults(res.defaults);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setProviders([]);
        setListError(err.message || '无法加载模型列表（请确认 Worker 已部署 /api/ai/providers）');
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isGuest, session?.token]);

  const kindProviders = useMemo(
    () => providers.filter((p) => p.kind === kind),
    [providers, kind],
  );

  const providerId =
    ai?.provider ||
    defaults[kind] ||
    kindProviders.find((p) => p.available)?.id ||
    kindProviders[0]?.id ||
    '';
  const provider = kindProviders.find((p) => p.id === providerId);
  const modelId = ai?.model || provider?.defaultModel || provider?.models[0]?.id || '';
  const model = provider?.models.find((m) => m.id === modelId) || provider?.models[0];
  const qualities = model?.qualities ?? [];
  const qualityId = ai?.quality || qualities[0]?.id || '';
  const prompt = ai?.prompt ?? '';
  const status = ai?.status ?? 'idle';
  const error = ai?.error;

  function patch(partial: Partial<BlockAiState>) {
    onAiChange({ ...ai, ...partial });
  }

  async function onSend() {
    if (isGuest || !session?.token) {
      patch({ status: 'error', error: '请先登录后再使用 AI 生成' });
      return;
    }
    if (!provider) {
      patch({
        status: 'error',
        error: listError || '没有可用的模型（请确认 API 已部署且已登录）',
      });
      return;
    }
    if (!provider.available) {
      patch({
        status: 'error',
        error: provider.reason || '该模型未配置密钥，可改选手传/导入，或稍后配置后重试',
      });
      return;
    }
    const p = prompt.trim();
    if (!p) {
      patch({ status: 'error', error: '请先填写提示词' });
      return;
    }

    setBusy(true);
    patch({
      status: 'running',
      error: undefined,
      provider: provider.id,
      model: modelId,
      quality: qualityId || undefined,
      source: 'ai',
    });
    try {
      const result = await apiClient.aiGenerate(
        {
          kind,
          provider: provider.id,
          model: modelId,
          prompt: p,
          quality: qualityId || undefined,
        },
        session.token,
      );
      if (result.kind === 'error') {
        patch({ status: 'error', error: result.message });
        return;
      }
      if (result.kind === 'text') {
        onTextResult?.(result.text);
        patch({ status: 'done', error: undefined });
        return;
      }
      if (result.kind === 'image') {
        onImageResult?.(result.url);
        patch({ status: 'done', error: undefined });
        return;
      }
      if (result.kind === 'video') {
        onVideoResult?.(result.url);
        patch({ status: 'done', error: undefined });
      }
    } catch (err) {
      patch({ status: 'error', error: (err as Error).message || '生成失败' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="block-ai-panel"
      style={style}
      data-stage-interactive
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="block-ai-row">
        <select
          className="block-ai-select"
          value={providerId}
          disabled={loadingList || kindProviders.length === 0}
          title={provider && !provider.available ? provider.reason : undefined}
          onChange={(e) => {
            const next = kindProviders.find((p) => p.id === e.target.value);
            patch({
              provider: e.target.value,
              model: next?.defaultModel || next?.models[0]?.id,
              quality: next?.models[0]?.qualities?.[0]?.id,
            });
          }}
        >
          {kindProviders.length === 0 && (
            <option value="">{loadingList ? '加载模型…' : '暂无模型'}</option>
          )}
          {kindProviders.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.available}>
              {p.label}
              {!p.available ? '（未配置）' : ''}
            </option>
          ))}
        </select>
        {qualities.length > 0 && (
          <select
            className="block-ai-select block-ai-quality"
            value={qualityId}
            onChange={(e) => patch({ quality: e.target.value })}
          >
            {qualities.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label}
              </option>
            ))}
          </select>
        )}
        {onImport && (
          <button type="button" className="block-ai-import" onClick={onImport}>
            {importLabel}
          </button>
        )}
      </div>
      <div className="block-ai-row block-ai-prompt-row">
        <input
          className="block-ai-prompt"
          value={prompt}
          placeholder={promptPlaceholder(kind)}
          disabled={busy}
          onChange={(e) => patch({ prompt: e.target.value, status: 'idle', error: undefined })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void onSend();
            }
          }}
        />
        <button
          type="button"
          className="block-ai-send"
          disabled={busy || loadingList}
          onClick={() => void onSend()}
        >
          {busy || status === 'running' ? '生成中…' : '发送'}
        </button>
      </div>
      {(error || listError) && (
        <div className="block-ai-error">{error || listError}</div>
      )}
      {!error && !listError && (
        <div className="block-ai-hint muted">{hintFor(kind)}</div>
      )}
    </div>
  );
}
