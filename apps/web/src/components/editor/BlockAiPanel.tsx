import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type {
  AiAttachment,
  AiGenParams,
  AiJobRecord,
  AiMediaKind,
  AiProviderInfo,
  AiProvidersResponse,
  BlockAiState,
} from '@webbook/shared';
import { CF_FLUX_2_KLEIN, CF_FLUX_SCHNELL, SEEDANCE_DEFAULT_PARAMS } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiClient, assetUrl } from '@/lib/api';
import { toast } from '@/store/useToastStore';
import { handleImageFile } from './imageUpload';
import { uid } from '@/lib/id';

export type NoteAiAsset = {
  id: string;
  label: string;
  url: string;
  kind: 'image' | 'video';
  blockId?: string;
};

type PanelKind = Extract<AiMediaKind, 'text' | 'image' | 'video' | 'model3d' | 'audio'>;

interface Props {
  kind: PanelKind;
  ai?: BlockAiState;
  onAiChange: (next: BlockAiState) => void;
  onTextResult?: (text: string) => void;
  onImageResult?: (url: string) => void;
  onVideoResult?: (url: string) => void;
  onModel3dResult?: (url: string, posterUrl?: string) => void;
  onAudioResult?: (url: string) => void;
  onImport?: () => void;
  importLabel?: string;
  noteAssets?: NoteAiAsset[];
  style?: CSSProperties;
}

let providersCache: AiProvidersResponse | null = null;
let providersInflight: Promise<AiProvidersResponse> | null = null;

async function loadProviders(token: string): Promise<AiProvidersResponse> {
  if (providersCache) return providersCache;
  if (!providersInflight) {
    providersInflight = apiClient
      .aiProviders(token)
      .then((r: AiProvidersResponse) => {
        providersCache = r;
        return r;
      })
      .finally(() => {
        providersInflight = null;
      });
  }
  return providersInflight;
}

function promptPlaceholder(kind: PanelKind): string {
  if (kind === 'image') return '描述要生成的图片… 输入 @ 引用素材，可 Ctrl+V 贴图';
  if (kind === 'video') return '描述要生成的视频…';
  if (kind === 'model3d') return '描述要生成的 3D 模型…';
  if (kind === 'audio') return '描述要生成的音乐（供应商待定）…';
  return '描述要生成的文字…';
}

function hintFor(kind: PanelKind, hasAtt: boolean): string {
  if (kind === 'image') {
    return hasAtt
      ? '已含参考图 → 将使用 FLUX.2；也可继续 @ 或粘贴'
      : '无参考图 → 付费 Seedream/Gemini/GPT 或 CF Schnell；@ 可加参考';
  }
  if (kind === 'video') return 'Seedance 异步生成；默参最低，可在下方调整';
  if (kind === 'model3d') return 'Tripo 异步生成；舞台显示预览图，双击进 3D';
  if (kind === 'audio') return '可先导入本地音频；AI 音乐供应商待定';
  return '也可直接手写 Markdown';
}

export function BlockAiPanel({
  kind,
  ai,
  onAiChange,
  onTextResult,
  onImageResult,
  onVideoResult,
  onModel3dResult,
  onAudioResult,
  onImport,
  importLabel = '导入',
  noteAssets = [],
  style,
}: Props) {
  const { session, isGuest } = useAuth();
  const [providers, setProviders] = useState<AiProviderInfo[]>(providersCache?.providers ?? []);
  const [defaults, setDefaults] = useState(providersCache?.defaults ?? {});
  const [loadingList, setLoadingList] = useState(!providersCache);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [pasteAssets, setPasteAssets] = useState<NoteAiAsset[]>([]);
  /** 默认收起，避免占舞台 */
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!expanded) return;
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
        setListError(err.message || '无法加载模型列表');
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, isGuest, session?.token]);

  const kindProviders = useMemo(
    () => providers.filter((p) => p.kind === kind),
    [providers, kind],
  );

  const attachments = ai?.attachments ?? [];
  const hasAttachments = attachments.length > 0;

  const catalogAssets = useMemo(() => {
    const map = new Map<string, NoteAiAsset>();
    for (const a of noteAssets) {
      if (a.url && !a.url.startsWith('blob:')) map.set(a.id, a);
    }
    for (const a of pasteAssets) map.set(a.id, a);
    return [...map.values()];
  }, [noteAssets, pasteAssets]);

  const filteredMentions = useMemo(() => {
    const q = mentionFilter.trim().toLowerCase();
    if (!q) return catalogAssets;
    return catalogAssets.filter(
      (a) => a.label.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
    );
  }, [catalogAssets, mentionFilter]);

  const providerId =
    ai?.provider ||
    defaults[kind] ||
    kindProviders.find((p) => p.available)?.id ||
    kindProviders[0]?.id ||
    '';
  const provider = kindProviders.find((p) => p.id === providerId);

  let modelId = ai?.model || provider?.defaultModel || provider?.models[0]?.id || '';
  if (kind === 'image' && hasAttachments) {
    modelId = CF_FLUX_2_KLEIN;
  } else if (kind === 'image' && !hasAttachments && modelId === CF_FLUX_2_KLEIN) {
    modelId = ai?.model && ai.model !== CF_FLUX_2_KLEIN ? ai.model : CF_FLUX_SCHNELL;
  }

  const model = provider?.models.find((m) => m.id === modelId) || provider?.models[0];
  const qualities = model?.qualities ?? [];
  const qualityId = ai?.quality || qualities[0]?.id || '';
  const prompt = ai?.prompt ?? '';
  const status = ai?.status ?? 'idle';
  const error = ai?.error;

  function patch(partial: Partial<BlockAiState>) {
    onAiChange({ ...ai, ...partial });
  }

  function insertMention(asset: NoteAiAsset) {
    const label = asset.label.replace(/\s+/g, '_');
    const token = `@${label}`;
    const el = inputRef.current;
    const start = el?.selectionStart ?? prompt.length;
    const end = el?.selectionEnd ?? start;
    // 吃掉正在输入的 @query
    let replaceFrom = start;
    const before = prompt.slice(0, start);
    const at = before.lastIndexOf('@');
    if (at >= 0 && !/\s/.test(before.slice(at + 1))) replaceFrom = at;
    const nextPrompt = prompt.slice(0, replaceFrom) + token + ' ' + prompt.slice(end);
    const exists = attachments.some((a) => a.id === asset.id || a.url === asset.url);
    const nextAtt: AiAttachment[] = exists
      ? attachments
      : [
          ...attachments,
          {
            id: asset.id,
            kind: asset.kind,
            label,
            url: asset.url,
            source: asset.blockId ? 'note-block' : 'paste',
            blockId: asset.blockId,
          },
        ];
    patch({
      prompt: nextPrompt,
      attachments: nextAtt,
      provider: kind === 'image' ? 'cf-workers-ai' : ai?.provider,
      model: kind === 'image' ? CF_FLUX_2_KLEIN : ai?.model,
      status: 'idle',
      error: undefined,
    });
    setMentionOpen(false);
    setMentionFilter('');
    requestAnimationFrame(() => {
      const pos = replaceFrom + token.length + 1;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  }

  function onPromptChange(value: string) {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at >= 0 && !/\s/.test(before.slice(at + 1))) {
      setMentionOpen(true);
      setMentionFilter(before.slice(at + 1));
    } else {
      setMentionOpen(false);
      setMentionFilter('');
    }
    patch({ prompt: value, status: 'idle', error: undefined });
  }

  async function onPromptPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const file = e.clipboardData.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.preventDefault();
    e.stopPropagation();
    if (isGuest || !session?.token) {
      toast('error', '请先登录后再粘贴参考图');
      return;
    }
    try {
      const url = await handleImageFile(file, session, isGuest);
      const id = uid('att');
      const label = `paste_${id.slice(-4)}`;
      const asset: NoteAiAsset = { id, label, url, kind: 'image' };
      setPasteAssets((prev) => [...prev, asset]);
      insertMention(asset);
      toast('info', '已加入参考图');
    } catch {
      toast('error', '参考图上传失败');
    }
  }

  async function onSend() {
    if (isGuest || !session?.token) {
      patch({ status: 'error', error: '请先登录后再使用 AI 生成' });
      toast('error', '请先登录后再使用 AI 生成');
      return;
    }
    if (!provider) {
      const msg = listError || '没有可用的模型';
      patch({ status: 'error', error: msg });
      toast('error', msg);
      return;
    }
    if (!provider.available) {
      const msg = provider.reason || '该模型未配置密钥';
      patch({ status: 'error', error: msg });
      toast('error', msg);
      return;
    }
    const p = prompt.trim();
    if (!p) {
      patch({ status: 'error', error: '请先填写提示词' });
      toast('error', '请先填写提示词');
      return;
    }

    const sendProvider = kind === 'image' && hasAttachments ? 'cf-workers-ai' : provider.id;
    const sendModel =
      kind === 'image' && hasAttachments ? CF_FLUX_2_KLEIN : modelId || provider.defaultModel || '';

    const params: AiGenParams | undefined =
      kind === 'video'
        ? {
            ...SEEDANCE_DEFAULT_PARAMS,
            ...ai?.params,
            watermark: false,
          }
        : ai?.params;

    setBusy(true);
    patch({
      status: 'running',
      error: undefined,
      provider: sendProvider,
      model: sendModel,
      quality: qualityId || undefined,
      source: 'ai',
      attachments,
      params,
      jobId: undefined,
    });
    try {
      const result = await apiClient.aiGenerate(
        {
          kind,
          provider: sendProvider,
          model: sendModel,
          prompt: p,
          quality: qualityId || undefined,
          attachments: hasAttachments ? attachments : undefined,
          params,
        },
        session.token,
      );
      if (result.kind === 'error') {
        patch({ status: 'error', error: result.message });
        toast('error', result.message);
        return;
      }
      if (result.kind === 'text') {
        onTextResult?.(result.text);
        toast('info', '文字已生成');
        return;
      }
      if (result.kind === 'image') {
        onImageResult?.(result.url);
        toast('info', '图片已生成');
        return;
      }
      if (result.kind === 'video') {
        onVideoResult?.(result.url);
        toast('info', '视频已生成');
        return;
      }
      if (result.kind === 'model3d') {
        onModel3dResult?.(result.url, result.posterUrl);
        toast('info', '3D 模型已生成');
        return;
      }
      if (result.kind === 'audio') {
        onAudioResult?.(result.url);
        toast('info', '音频已生成');
        return;
      }
      if (result.kind === 'job') {
        patch({ status: 'submitted', jobId: result.jobId, error: undefined });
        toast('info', '已提交，生成中…');
        await pollJobUntilDone(session.token, result.jobId);
        return;
      }
      const msg = `未知生成结果: ${(result as { kind?: string }).kind ?? typeof result}`;
      patch({ status: 'error', error: msg });
      toast('error', msg);
    } catch (err) {
      const msg = (err as Error).message || '生成失败';
      patch({ status: 'error', error: msg });
      toast('error', msg);
    } finally {
      setBusy(false);
    }
  }

  async function pollJobUntilDone(token: string, jobId: string) {
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const job: AiJobRecord = await apiClient.aiJob(jobId, token);
      if (job.status === 'running' || job.status === 'queued') {
        patch({ status: 'submitted', jobId });
        continue;
      }
      if (job.status === 'failed') {
        patch({ status: 'error', error: job.error || '生成失败', jobId });
        toast('error', job.error || '生成失败');
        return;
      }
      if (job.status === 'succeeded' && job.resultUrl) {
        if (kind === 'video') onVideoResult?.(job.resultUrl);
        else if (kind === 'model3d') onModel3dResult?.(job.resultUrl, job.posterUrl);
        else if (kind === 'audio') onAudioResult?.(job.resultUrl);
        patch({ status: 'done', jobId, source: 'ai' });
        toast('info', '生成完成');
        return;
      }
    }
    patch({ status: 'error', error: '生成超时，请稍后重试', jobId });
    toast('error', '生成超时');
  }

  const panelStyle: CSSProperties = expanded
    ? style ?? {}
    : {
        ...(style ?? {}),
        width: 'auto',
        minWidth: 0,
        maxWidth: 120,
      };

  return (
    <div
      className={`block-ai-panel ${expanded ? 'is-expanded' : 'is-collapsed'}`}
      style={panelStyle}
      data-stage-interactive
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onPaste={(e) => e.stopPropagation()}
    >
      <div className="block-ai-row block-ai-toggle-row">
        <button
          type="button"
          className="block-ai-toggle"
          aria-expanded={expanded}
          title={expanded ? '收起 AI 助手' : '展开 AI 助手'}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '▾ AI' : '▸ AI'}
        </button>
      </div>
      {expanded && (
        <div className="block-ai-panel-body">
      <div className="block-ai-row">
        <select
          className="block-ai-select"
          value={hasAttachments && kind === 'image' ? 'cf-workers-ai' : providerId}
          disabled={loadingList || kindProviders.length === 0 || (hasAttachments && kind === 'image')}
          title={
            hasAttachments && kind === 'image'
              ? '有参考图时强制 FLUX.2'
              : provider && !provider.available
                ? provider.reason
                : undefined
          }
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
              {hasAttachments && kind === 'image' && p.id === 'cf-workers-ai' ? ' · FLUX.2' : ''}
            </option>
          ))}
        </select>
        {qualities.length > 0 && !hasAttachments && (
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
      {kind === 'video' && (
        <div className="block-ai-row block-ai-params">
          <select
            className="block-ai-select"
            value={String(ai?.params?.duration ?? SEEDANCE_DEFAULT_PARAMS.duration)}
            onChange={(e) =>
              patch({
                params: {
                  ...SEEDANCE_DEFAULT_PARAMS,
                  ...ai?.params,
                  duration: Number(e.target.value),
                  watermark: false,
                },
              })
            }
          >
            <option value={5}>5s</option>
            <option value={10}>10s</option>
          </select>
          <select
            className="block-ai-select"
            value={ai?.params?.resolution ?? SEEDANCE_DEFAULT_PARAMS.resolution}
            onChange={(e) =>
              patch({
                params: {
                  ...SEEDANCE_DEFAULT_PARAMS,
                  ...ai?.params,
                  resolution: e.target.value,
                  watermark: false,
                },
              })
            }
          >
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
          <select
            className="block-ai-select"
            value={ai?.params?.ratio ?? SEEDANCE_DEFAULT_PARAMS.ratio}
            onChange={(e) =>
              patch({
                params: {
                  ...SEEDANCE_DEFAULT_PARAMS,
                  ...ai?.params,
                  ratio: e.target.value,
                  watermark: false,
                },
              })
            }
          >
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
          </select>
          <label className="block-ai-check">
            <input
              type="checkbox"
              checked={Boolean(ai?.params?.generateAudio)}
              onChange={(e) =>
                patch({
                  params: {
                    ...SEEDANCE_DEFAULT_PARAMS,
                    ...ai?.params,
                    generateAudio: e.target.checked,
                    watermark: false,
                  },
                })
              }
            />
            音频
          </label>
        </div>
      )}
      {attachments.length > 0 && (
        <div className="block-ai-atts">
          {attachments.map((a) => (
            <span key={a.id} className="block-ai-att" title={a.url}>
              {a.kind === 'image' && (
                <img src={assetUrl(a.url)} alt="" className="block-ai-att-thumb" />
              )}
              @{a.label}
              <button
                type="button"
                className="block-ai-att-x"
                aria-label="移除"
                onClick={() =>
                  patch({
                    attachments: attachments.filter((x) => x.id !== a.id),
                    model: CF_FLUX_SCHNELL,
                  })
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="block-ai-row block-ai-prompt-row" style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          className="block-ai-prompt"
          value={prompt}
          placeholder={promptPlaceholder(kind)}
          disabled={busy}
          onChange={(e) => onPromptChange(e.target.value)}
          onPaste={(e) => void onPromptPaste(e)}
          onKeyDown={(e) => {
            if (mentionOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
              if (e.key === 'Enter' && filteredMentions[0]) {
                e.preventDefault();
                insertMention(filteredMentions[0]);
                return;
              }
            }
            if (e.key === 'Escape') setMentionOpen(false);
            if (e.key === 'Enter' && !e.shiftKey && !mentionOpen) {
              e.preventDefault();
              void onSend();
            }
          }}
        />
        <button type="button" className="block-ai-send" disabled={busy} onClick={() => void onSend()}>
          {busy || status === 'running' ? '生成中…' : loadingList ? '准备中…' : '发送'}
        </button>
        {mentionOpen && filteredMentions.length > 0 && (
          <ul className="block-ai-mention-list" role="listbox">
            {filteredMentions.slice(0, 12).map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="block-ai-mention-item"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(a);
                  }}
                >
                  {a.kind === 'image' && (
                    <img src={assetUrl(a.url)} alt="" className="block-ai-att-thumb" />
                  )}
                  <span>@{a.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {(error || listError) && <div className="block-ai-error">{error || listError}</div>}
      {!error && !listError && (
        <div className="block-ai-hint muted">{hintFor(kind, hasAttachments)}</div>
      )}
        </div>
      )}
    </div>
  );
}
