import type { Block, BlockType, CanvasBlock } from '@webbook/shared';
import { createBlock } from './blockFactory';
import { InsertMenu } from './InsertMenu';
import { CanvasBlockView } from './CanvasBlockView';
import { LinkPreviewBlockView } from './LinkPreviewBlockView';

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  readOnly?: boolean;
}

export function BlockEditor({ blocks, onChange, readOnly }: Props) {
  function insertAt(index: number, type: BlockType) {
    const next = [...blocks];
    next.splice(index, 0, createBlock(type));
    onChange(next);
  }

  function patch(id: string, patchBlock: Partial<Block>) {
    onChange(
      blocks.map((b) => (b.id === id ? ({ ...b, ...patchBlock } as Block) : b)),
    );
  }

  function remove(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
  }

  return (
    <div className="block-editor">
      {!readOnly && (
        <InsertRow onInsert={(t) => insertAt(0, t)} />
      )}
      {blocks.map((block, i) => (
        <div key={block.id} className="block-row">
          <BlockView block={block} patch={patch} remove={remove} readOnly={readOnly} />
          {!readOnly && <InsertRow onInsert={(t) => insertAt(i + 1, t)} />}
        </div>
      ))}
      {blocks.length === 0 && readOnly && (
        <p className="muted">（空笔记）</p>
      )}
    </div>
  );
}

function InsertRow({ onInsert }: { onInsert: (t: BlockType) => void }) {
  return (
    <div className="insert-row">
      <InsertMenu onInsert={onInsert} />
    </div>
  );
}

interface BlockViewProps {
  block: Block;
  patch: (id: string, patch: Partial<Block>) => void;
  remove: (id: string) => void;
  readOnly?: boolean;
}

function BlockView({ block, patch, remove, readOnly }: BlockViewProps) {
  const ro = Boolean(readOnly);
  const delBtn = !ro && (
    <button className="block-del btn btn-ghost" title="删除块" onClick={() => remove(block.id)}>
      ✕
    </button>
  );

  switch (block.type) {
    case 'heading':
      return (
        <div className="block block-heading">
          {!ro && (
            <select
              className="heading-level"
              value={block.level}
              onChange={(e) => patch(block.id, { level: Number(e.target.value) as 1 | 2 | 3 })}
            >
              <option value={1}>H1</option>
              <option value={2}>H2</option>
              <option value={3}>H3</option>
            </select>
          )}
          {ro ? (
            <div className={`h h${block.level}`}>{block.text}</div>
          ) : (
            <input
              className={`h-input h${block.level}`}
              value={block.text}
              placeholder="标题"
              onChange={(e) => patch(block.id, { text: e.target.value })}
            />
          )}
          {delBtn}
        </div>
      );

    case 'paragraph':
      return (
        <div className="block block-para">
          {ro ? (
            <p className="para-text">{block.text}</p>
          ) : (
            <textarea
              className="para-input"
              value={block.text}
              placeholder="输入文本，支持 Markdown…"
              rows={Math.max(1, block.text.split('\n').length)}
              onChange={(e) => patch(block.id, { text: e.target.value })}
            />
          )}
          {delBtn}
        </div>
      );

    case 'checkbox':
      return (
        <div className="block block-checkbox">
          <input
            type="checkbox"
            checked={block.checked}
            disabled={ro}
            onChange={(e) => patch(block.id, { checked: e.target.checked })}
          />
          {ro ? (
            <span className={block.checked ? 'done' : ''}>{block.text}</span>
          ) : (
            <input
              className="cb-input"
              value={block.text}
              placeholder="待办事项 (TODO)"
              onChange={(e) => patch(block.id, { text: e.target.value })}
            />
          )}
          {delBtn}
        </div>
      );

    case 'list':
      return (
        <div className="block block-list">
          {ro ? (
            <ul>
              {block.items.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ul>
          ) : (
            <textarea
              className="list-input"
              value={block.items.join('\n')}
              placeholder="每行一项"
              rows={Math.max(1, block.items.length)}
              onChange={(e) => patch(block.id, { items: e.target.value.split('\n') })}
            />
          )}
          {delBtn}
        </div>
      );

    case 'image':
      return (
        <div className="block block-image">
          {block.src ? (
            <img src={block.src} alt={block.alt ?? ''} />
          ) : (
            !ro && (
              <input
                className="url-input"
                placeholder="图片 URL"
                onChange={(e) => patch(block.id, { src: e.target.value })}
              />
            )
          )}
          {delBtn}
        </div>
      );

    case 'video':
      return (
        <div className="block block-video">
          {block.src ? (
            <video src={block.src} controls />
          ) : (
            !ro && (
              <input
                className="url-input"
                placeholder="视频 URL"
                onChange={(e) => patch(block.id, { src: e.target.value })}
              />
            )
          )}
          {delBtn}
        </div>
      );

    case 'link-preview':
      return (
        <div className="block block-link">
          <LinkPreviewBlockView
            block={block}
            patch={(p) => patch(block.id, p)}
            readOnly={ro}
          />
          {delBtn}
        </div>
      );

    case 'callout':
      return (
        <div className={`block block-callout tone-${block.tone}`}>
          {ro ? (
            <p>{block.text}</p>
          ) : (
            <textarea
              className="callout-input"
              value={block.text}
              placeholder="标注内容"
              onChange={(e) => patch(block.id, { text: e.target.value })}
            />
          )}
          {delBtn}
        </div>
      );

    case 'divider':
      return (
        <div className="block block-divider">
          <hr />
          {delBtn}
        </div>
      );

    case 'canvas':
      return (
        <div className="block block-canvas">
          <CanvasBlockView
            block={block as CanvasBlock}
            onChange={(b) => patch(block.id, b)}
            readOnly={ro}
          />
          {delBtn}
        </div>
      );

    default:
      return null;
  }
}
