import { useEffect, useRef, useState } from 'react';
import type { LinkPreviewBlock } from '@webbook/shared';
import { apiClient } from '@/lib/api';

interface Props {
  block: LinkPreviewBlock;
  patch: (patch: Partial<LinkPreviewBlock>) => void;
  readOnly?: boolean;
  autoFocus?: boolean;
  /** 舞台壳自己处理双击打开时关闭卡面 dblclick，避免重复打开 */
  disableCardDoubleClick?: boolean;
}

function openUrl(url: string) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function LinkPreviewBlockView({
  block,
  patch,
  readOnly,
  autoFocus,
  disableCardDoubleClick,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (autoFocus && !readOnly) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [autoFocus, readOnly]);

  async function fetchMeta() {
    if (!block.url) return;
    setLoading(true);
    try {
      const meta = await apiClient.linkPreview(block.url);
      patch(meta);
    } catch {
      // 离线 / 无 API：仅保留 URL
      patch({ title: block.url });
    } finally {
      setLoading(false);
    }
  }

  if (block.title || block.description) {
    return (
      <div
        className="link-card"
        onDoubleClick={
          disableCardDoubleClick
            ? undefined
            : (e) => {
                e.preventDefault();
                e.stopPropagation();
                openUrl(block.url);
              }
        }
      >
        {block.image && <img className="link-thumb" src={block.image} alt="" />}
        <div className="link-meta">
          <div className="link-title">{block.title ?? block.url}</div>
          {block.description && <div className="link-desc">{block.description}</div>}
          <div className="link-url-row">
            <div className="link-url muted">{block.url}</div>
            <button
              type="button"
              className="btn link-open-btn"
              title="在新标签打开"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                openUrl(block.url);
              }}
            >
              打开
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (readOnly) {
    return (
      <button
        type="button"
        className="link-readonly-open"
        onClick={() => openUrl(block.url)}
      >
        {block.url || '(空链接)'}
      </button>
    );
  }

  return (
    <div className="link-input-row">
      <input
        ref={inputRef}
        className="url-input"
        placeholder="粘贴链接 URL"
        value={block.url}
        onChange={(e) => patch({ url: e.target.value })}
      />
      <button className="btn" disabled={loading} onClick={fetchMeta}>
        {loading ? '获取中…' : '生成预览'}
      </button>
    </div>
  );
}
