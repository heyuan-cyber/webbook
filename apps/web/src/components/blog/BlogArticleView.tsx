import type { Block } from '@webbook/shared';
import { assetUrl } from '@/lib/api';
import { renderInlineMarkdown, renderMarkdownDocument } from '@/lib/markdown';

interface Props {
  blocks: Block[];
}

/**
 * 将舞台/文档块按 blocks[] 顺序展成单栏文章流（阅读态，无画布、无连线）。
 */
export function BlogArticleView({ blocks }: Props) {
  return (
    <article className="blog-article-view">
      {blocks.map((block) => (
        <BlogBlock key={block.id} block={block} />
      ))}
    </article>
  );
}

function BlogBlock({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading': {
      const Tag = (`h${block.level}` as 'h1' | 'h2' | 'h3');
      return <Tag className={`blog-a-h blog-a-h${block.level}`}>{renderInlineMarkdown(block.text)}</Tag>;
    }
    case 'paragraph':
      if (!block.text.trim()) return null;
      return (
        <div className="blog-a-p preview-md">
          {renderMarkdownDocument(block.text, 'blog-a-line')}
        </div>
      );
    case 'list':
      return block.ordered ? (
        <ol className="blog-a-list">
          {block.items.map((item, i) => (
            <li key={i}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>
      ) : (
        <ul className="blog-a-list">
          {block.items.map((item, i) => (
            <li key={i}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
    case 'checkbox':
      return (
        <p className={`blog-a-check ${block.checked ? 'is-done' : ''}`}>
          <span aria-hidden>{block.checked ? '☑' : '☐'}</span>{' '}
          {renderInlineMarkdown(block.text)}
        </p>
      );
    case 'callout':
      return (
        <aside className={`blog-a-callout tone-${block.tone}`}>
          {renderMarkdownDocument(block.text, 'blog-a-line')}
        </aside>
      );
    case 'sticky':
      return (
        <aside
          className="blog-a-sticky"
          style={block.color ? { background: block.color } : undefined}
        >
          <pre className="blog-a-sticky-text">{block.text}</pre>
        </aside>
      );
    case 'image':
      if (!block.src) return null;
      return (
        <figure className={`blog-a-figure align-${block.align ?? 'center'}`}>
          <img src={assetUrl(block.src)} alt={block.alt ?? ''} loading="lazy" />
          {block.caption ? (
            <figcaption>{renderInlineMarkdown(block.caption)}</figcaption>
          ) : null}
        </figure>
      );
    case 'video':
      if (!block.src) return null;
      return (
        <figure className="blog-a-figure">
          <video src={assetUrl(block.src)} controls playsInline />
          {block.caption ? (
            <figcaption>{renderInlineMarkdown(block.caption)}</figcaption>
          ) : null}
        </figure>
      );
    case 'audio':
      if (!block.src) return null;
      return (
        <figure className="blog-a-figure">
          <audio src={assetUrl(block.src)} controls />
          {block.title || block.caption ? (
            <figcaption>{block.title || block.caption}</figcaption>
          ) : null}
        </figure>
      );
    case 'model3d':
      if (!block.poster && !block.src) return null;
      return (
        <figure className="blog-a-figure">
          {block.poster ? (
            <img src={assetUrl(block.poster)} alt={block.caption ?? '3D'} loading="lazy" />
          ) : (
            <p className="muted">3D 模型（请在编辑器中预览）</p>
          )}
          {block.caption ? (
            <figcaption>{renderInlineMarkdown(block.caption)}</figcaption>
          ) : null}
        </figure>
      );
    case 'link-preview':
      if (!block.url) return null;
      return (
        <a
          className="blog-a-link"
          href={block.url}
          target="_blank"
          rel="noreferrer"
        >
          {block.image ? (
            <img className="blog-a-link-thumb" src={block.image} alt="" />
          ) : null}
          <span className="blog-a-link-body">
            <span className="blog-a-link-title">
              {block.title?.trim() || block.url}
            </span>
            {block.description ? (
              <span className="blog-a-link-desc muted">{block.description}</span>
            ) : null}
            <span className="blog-a-link-url muted">{block.url}</span>
          </span>
        </a>
      );
    case 'divider':
      return <hr className="blog-a-hr" />;
    case 'canvas':
      return null;
    default:
      return null;
  }
}
