import { useState } from 'react';
import type { LinkPreviewBlock } from '@webbook/shared';
import { apiClient } from '@/lib/api';

interface Props {
  block: LinkPreviewBlock;
  patch: (patch: Partial<LinkPreviewBlock>) => void;
  readOnly?: boolean;
}

export function LinkPreviewBlockView({ block, patch, readOnly }: Props) {
  const [loading, setLoading] = useState(false);

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
      <a className="link-card" href={block.url} target="_blank" rel="noreferrer">
        {block.image && <img className="link-thumb" src={block.image} alt="" />}
        <div className="link-meta">
          <div className="link-title">{block.title ?? block.url}</div>
          {block.description && <div className="link-desc">{block.description}</div>}
          <div className="link-url muted">{block.url}</div>
        </div>
      </a>
    );
  }

  if (readOnly) {
    return (
      <a href={block.url} target="_blank" rel="noreferrer">
        {block.url || '(空链接)'}
      </a>
    );
  }

  return (
    <div className="link-input-row">
      <input
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
