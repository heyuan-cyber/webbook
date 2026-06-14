import { useRef, useCallback, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Block, BlockType, CanvasBlock } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiClient, assetUrl } from '@/lib/api';
import { createBlock } from './blockFactory';
import { InsertMenu } from './InsertMenu';
import { SlashMenu } from './SlashMenu';
import { CanvasBlockView } from './CanvasBlockView';
import { LinkPreviewBlockView } from './LinkPreviewBlockView';
import { handleBlockKeyDown, isEditableBlock } from './blockKeyboard';
import { convertBlock, isInPlaceSlashType, isSlashInput, slashFilter } from './slashCommand';
import { EditableMarkdownField } from './EditableMarkdownField';
import { renderInlineMarkdown, renderMultilineMarkdown } from '@/lib/markdown';
import { toast } from '@/store/useToastStore';

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  readOnly?: boolean;
}

export function BlockEditor({ blocks, onChange, readOnly }: Props) {
  const focusRefs = useRef(new Map<string, HTMLElement>());

  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) focusRefs.current.set(id, el);
    else focusRefs.current.delete(id);
  }, []);

  function focusBlock(id: string) {
    requestAnimationFrame(() => focusRefs.current.get(id)?.focus());
  }

  function focusBlockAt(index: number) {
    let i = index;
    while (i >= 0 && i < blocks.length) {
      const b = blocks[i]!;
      if (isEditableBlock(b)) {
        const el = focusRefs.current.get(b.id);
        if (el) {
          el.focus();
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            const len = el.value.length;
            el.setSelectionRange(len, len);
          }
        }
        return;
      }
      i += index < i ? -1 : 1;
    }
  }

  function insertAt(index: number, type: BlockType = 'paragraph') {
    const newBlock = createBlock(type);
    const next = [...blocks];
    next.splice(index, 0, newBlock);
    onChange(next);
    focusBlock(newBlock.id);
  }

  function removeAt(index: number) {
    const next = blocks.filter((_, i) => i !== index);
    onChange(next.length ? next : [createBlock('paragraph')]);
    requestAnimationFrame(() => focusBlockAt(Math.max(0, index - 1)));
  }

  function patch(id: string, patchBlock: Partial<Block>) {
    onChange(
      blocks.map((b) => (b.id === id ? ({ ...b, ...patchBlock } as Block) : b)),
    );
  }

  function remove(id: string) {
    const next = blocks.filter((b) => b.id !== id);
    onChange(next.length ? next : [createBlock('paragraph')]);
  }

  function applySlash(index: number, blockId: string, type: BlockType) {
    const block = blocks[index];
    if (!block) return;
    if (isInPlaceSlashType(type)) {
      onChange(blocks.map((b) => (b.id === blockId ? convertBlock(block, type) : b)));
      focusBlock(blockId);
      return;
    }
    const cleared = blocks.map((b) =>
      b.id === blockId && b.type === 'paragraph' ? { ...b, text: '' } : b,
    );
    const newBlock = createBlock(type);
    const next = [...cleared];
    next.splice(index + 1, 0, newBlock);
    onChange(next);
    focusBlock(newBlock.id);
  }

  function ensureWritingSurface() {
    const para = createBlock('paragraph');
    onChange([para]);
    focusBlock(para.id);
  }

  if (blocks.length === 0 && !readOnly) {
    return (
      <button type="button" className="editor-placeholder" onClick={ensureWritingSurface}>
        <span className="editor-placeholder-title">开始书写</span>
        <span className="muted">直接输入文字，<kbd>Enter</kbd> 换行、<kbd>Shift+Enter</kbd> 新块，或键入 <kbd>/</kbd> 插入块</span>
      </button>
    );
  }

  return (
    <div className="block-editor">
      {blocks.map((block, i) => (
        <div key={block.id} className="block-row">
          <BlockView
            block={block}
            index={i}
            patch={patch}
            remove={remove}
            readOnly={readOnly}
            registerRef={registerRef}
            onInsertAfter={(type) => insertAt(i + 1, type ?? 'paragraph')}
            onRemoveAt={() => removeAt(i)}
            onFocusAt={focusBlockAt}
            onSlashPick={(type) => applySlash(i, block.id, type)}
            blocks={blocks}
          />
          {!readOnly && <InsertRow onInsert={(t) => insertAt(i + 1, t)} />}
        </div>
      ))}
      {blocks.length === 0 && readOnly && <p className="muted">（空笔记）</p>}
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
  index: number;
  blocks: Block[];
  patch: (id: string, patch: Partial<Block>) => void;
  remove: (id: string) => void;
  readOnly?: boolean;
  registerRef: (id: string, el: HTMLElement | null) => void;
  onInsertAfter: (type?: BlockType) => void;
  onRemoveAt: () => void;
  onFocusAt: (index: number) => void;
  onSlashPick: (type: BlockType) => void;
}

function BlockView({
  block,
  index,
  blocks,
  patch,
  remove,
  readOnly,
  registerRef,
  onInsertAfter,
  onRemoveAt,
  onFocusAt,
  onSlashPick,
}: BlockViewProps) {
  const ro = Boolean(readOnly);
  const delBtn = !ro && (
    <button className="block-del btn btn-ghost" title="删除块" onClick={() => remove(block.id)}>
      ✕
    </button>
  );

  const makeKeyNav =
    (el: HTMLInputElement | HTMLTextAreaElement) =>
    (e: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Escape' && block.type === 'paragraph' && isSlashInput(block.text)) {
        e.preventDefault();
        patch(block.id, { text: '' });
        return;
      }
      handleBlockKeyDown(e, {
        index,
        block,
        blocks,
        el,
        onInsertAfter: (_idx, type) => onInsertAfter(type),
        onRemoveAt,
        onFocusAt,
      });
    };

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
            <div className={`h h${block.level} preview-md`}>{renderInlineMarkdown(block.text)}</div>
          ) : (
            <EditableMarkdownField
              blockId={block.id}
              value={block.text}
              onChange={(text) => patch(block.id, { text })}
              onKeyDown={(e) => makeKeyNav(e.currentTarget)(e)}
              placeholder="标题（支持 **粗体**、[链接](url)）"
              registerRef={registerRef}
              multiline={false}
              inputClassName={`h-input h${block.level}`}
              previewClassName={`h h${block.level}`}
            />
          )}
          {delBtn}
        </div>
      );

    case 'paragraph':
      return (
        <div className="block block-para">
          {ro ? (
            <div className="para-text preview-md">{renderMultilineMarkdown(block.text, 'para-line')}</div>
          ) : (
            <div className="para-edit-wrap">
              <EditableMarkdownField
                blockId={block.id}
                value={block.text}
                onChange={(text) => patch(block.id, { text })}
                onKeyDown={(e) => makeKeyNav(e.currentTarget)(e)}
                placeholder="输入文字（支持 **粗体**、`代码`、[链接](url)）；Enter 换行，Shift+Enter 新块；/ 插入块"
                registerRef={registerRef}
                inputClassName="para-input"
                rows={2}
              />
              {isSlashInput(block.text) && (
                <SlashMenu
                  filter={slashFilter(block.text)}
                  onPick={onSlashPick}
                  onClose={() => patch(block.id, { text: '' })}
                />
              )}
            </div>
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
            <span className={block.checked ? 'done' : ''}>
              {renderMultilineMarkdown(block.text, 'preview-line')}
            </span>
          ) : (
            <EditableMarkdownField
              blockId={block.id}
              value={block.text}
              onChange={(text) => patch(block.id, { text })}
              onKeyDown={(e) => makeKeyNav(e.currentTarget)(e)}
              placeholder="待办事项"
              registerRef={registerRef}
              multiline={false}
              inputClassName="cb-input"
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
                <li key={i} className="preview-md">
                  {renderMultilineMarkdown(it, 'preview-line')}
                </li>
              ))}
            </ul>
          ) : (
            <EditableMarkdownField
              blockId={block.id}
              value={block.items.join('\n')}
              onChange={(text) => patch(block.id, { items: text.split('\n') })}
              onKeyDown={(e) => makeKeyNav(e.currentTarget)(e)}
              placeholder="每行一项（Enter 新行，Shift+Enter 新块）"
              registerRef={registerRef}
              inputClassName="list-input"
              rows={Math.max(1, block.items.length)}
            />
          )}
          {delBtn}
        </div>
      );

    case 'image':
      return (
        <div className="block block-image">
          {block.src ? (
            <figure>
              <img src={assetUrl(block.src)} alt={block.alt ?? ''} />
              {block.caption && <figcaption className="muted">{block.caption}</figcaption>}
            </figure>
          ) : (
            !ro && <ImageUploadRow onUploaded={(src) => patch(block.id, { src })} />
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
          <LinkPreviewBlockView block={block} patch={(p) => patch(block.id, p)} readOnly={ro} />
          {delBtn}
        </div>
      );

    case 'callout':
      return (
        <div className={`block block-callout tone-${block.tone}`}>
          {ro ? (
            <div className="preview-md">{renderMultilineMarkdown(block.text, 'preview-line')}</div>
          ) : (
            <EditableMarkdownField
              blockId={block.id}
              value={block.text}
              onChange={(text) => patch(block.id, { text })}
              placeholder="标注内容"
              registerRef={registerRef}
              inputClassName="callout-input"
              rows={2}
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

function ImageUploadRow({ onUploaded }: { onUploaded: (src: string) => void }) {
  const { session, isGuest } = useAuth();
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setBusy(true);
    try {
      if (isGuest || !session?.token) {
        const dataUrl = await readAsDataUrl(file);
        onUploaded(dataUrl);
        toast('info', '游客模式：图片仅存本地');
      } else {
        const { url } = await apiClient.uploadAsset(file, session.token);
        onUploaded(url);
        toast('success', '图片已上传');
      }
    } catch {
      toast('error', '图片上传失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="image-upload-row">
      <label className="btn btn-ghost">
        {busy ? '上传中…' : '选择图片'}
        <input
          type="file"
          accept="image/*"
          hidden
          disabled={busy}
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>
      <span className="muted">或粘贴 URL：</span>
      <input
        className="url-input"
        placeholder="https://..."
        onBlur={(e) => {
          if (e.target.value) onUploaded(e.target.value);
        }}
      />
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
