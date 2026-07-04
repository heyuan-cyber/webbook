import { useRef, useCallback, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Block, BlockType, CanvasBlock, ImageBlock, NoteStage } from '@webbook/shared';
import {
  DEFAULT_NOTE_STAGE,
  headingHasSectionBody,
  isAbsoluteBlock,
  isBlockHiddenByCollapse,
} from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiClient } from '@/lib/api';
import { createBlock, createAbsoluteBlock, type StageAbsoluteType } from './blockFactory';
import { InsertMenu } from './InsertMenu';
import { SlashMenu } from './SlashMenu';
import { CanvasBlockView } from './CanvasBlockView';
import { pasteIntoCanvas, createImageElement } from './canvasPaste';
import type { ImageBlockDragPayload } from './canvasDrag';
import { handleImageFile, readAsDataUrl } from './imageUpload';
import { LinkPreviewBlockView } from './LinkPreviewBlockView';
import { handleBlockKeyDown, isEditableBlock } from './blockKeyboard';
import { convertBlock, isInPlaceSlashType, isSlashInput, slashFilter } from './slashCommand';
import { EditableMarkdownField } from './EditableMarkdownField';
import { ImageBlockView } from './ImageBlockView';
import { StickyBlockView } from './StickyBlockView';
import { AbsoluteImageBlockView } from './AbsoluteImageBlockView';
import { AbsoluteLinkBlockView } from './AbsoluteLinkBlockView';
import { StageBlockPicker } from './StageBlockPicker';
import { StageViewport } from './StageViewport';
import { findInsertIndexForWorldY, type WorldPoint } from './stageCoords';
import { renderInlineMarkdown, renderMultilineMarkdown } from '@/lib/markdown';
import { toast } from '@/store/useToastStore';

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  readOnly?: boolean;
  stage?: NoteStage;
  onStageChange?: (stage: NoteStage) => void;
  collapsedHeadingIds?: ReadonlySet<string>;
  onToggleHeadingCollapse?: (headingId: string) => void;
}

export function BlockEditor({
  blocks,
  onChange,
  readOnly,
  stage: stageProp,
  onStageChange,
  collapsedHeadingIds,
  onToggleHeadingCollapse,
}: Props) {
  const stage = stageProp ?? DEFAULT_NOTE_STAGE;
  const collapsed = collapsedHeadingIds ?? new Set<string>();
  const { session, isGuest } = useAuth();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const focusRefs = useRef(new Map<string, HTMLElement>());
  const activeIndexRef = useRef<number | null>(null);
  const [activeCanvas, setActiveCanvas] = useState<{
    blockId: string;
    x: number;
    y: number;
  } | null>(null);
  const [dragBlockIndex, setDragBlockIndex] = useState<number | null>(null);
  const [composer, setComposer] = useState<WorldPoint | null>(null);
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null);

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

  function moveBlock(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) return;
    const next = [...blocks];
    const [item] = next.splice(from, 1);
    const insertAt = from < to ? to - 1 : to;
    next.splice(insertAt, 0, item!);
    onChange(next);
  }

  const insertImageAt = useCallback(
    (src: string, atIndex?: number) => {
      const imgBlock = createBlock('image') as ImageBlock;
      imgBlock.src = src;
      const base =
        atIndex ??
        (activeIndexRef.current !== null ? activeIndexRef.current + 1 : blocks.length);
      const insertAt = Math.max(0, Math.min(base, blocks.length));
      const next = [...blocks];
      next.splice(insertAt, 0, imgBlock);
      onChange(next);
    },
    [blocks, onChange],
  );

  const handleImage = useCallback(
    (src: string, atIndex?: number) => insertImageAt(src, atIndex),
    [insertImageAt],
  );

  const editorRefCallback = useCallback(
    (el: HTMLDivElement | null) => {
      editorRef.current = el;
    },
    [],
  );

  const migrateImageToCanvas = useCallback(
    (payload: ImageBlockDragPayload, canvasBlockId: string, x: number, y: number) => {
      const canvas = blocks.find((b) => b.id === canvasBlockId && b.type === 'canvas');
      if (!canvas || canvas.type !== 'canvas') return;
      const el = createImageElement(payload.src, x, y, {
        width: payload.width,
        crop: payload.crop,
      });
      const next = blocks
        .filter((b) => b.id !== payload.blockId)
        .map((b) =>
          b.id === canvasBlockId && b.type === 'canvas'
            ? { ...b, elements: [...b.elements, el] }
            : b,
        );
      onChange(next.length ? next : [createBlock('paragraph')]);
      setActiveCanvas({ blockId: canvasBlockId, x, y });
    },
    [blocks, onChange],
  );

  const activateCanvas = useCallback((blockId: string, x: number, y: number) => {
    setActiveCanvas({ blockId, x, y });
    activeIndexRef.current = null;
  }, []);

  const onPaste = useCallback(
    async (e: React.ClipboardEvent) => {
      if (readOnly) return;
      if (activeCanvas) {
        const block = blocks.find((b) => b.id === activeCanvas.blockId);
        if (block?.type === 'canvas') {
          const file = e.clipboardData.files?.[0];
          const text = e.clipboardData.getData('text/plain')?.trim();
          if ((file && file.type.startsWith('image/')) || text) {
            e.preventDefault();
            try {
              const updated = await pasteIntoCanvas(
                e.clipboardData,
                block,
                { x: activeCanvas.x, y: activeCanvas.y },
                session,
                isGuest,
              );
              if (updated) {
                onChange(blocks.map((b) => (b.id === block.id ? updated : b)));
                return;
              }
            } catch {
              toast('error', '粘贴到画布失败');
              return;
            }
          }
        }
      }
      const file = e.clipboardData.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      e.preventDefault();
      handleImageFile(file, session, isGuest)
        .then((src) => handleImage(src))
        .catch(() => toast('error', '粘贴图片失败'));
    },
    [activeCanvas, blocks, onChange, session, isGuest, handleImage, readOnly],
  );

  const dropImageFile = useCallback(
    (file: File, blockIndex: number) => {
      handleImageFile(file, session, isGuest)
        .then((src) => handleImage(src, blockIndex + 1))
        .catch(() => toast('error', '拖入图片失败'));
    },
    [handleImage, session, isGuest],
  );

  const onEditorDrop = useCallback(
    (e: React.DragEvent) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      e.preventDefault();
      const row = (e.target as HTMLElement).closest('[data-block-index]');
      const idx = row ? Number(row.getAttribute('data-block-index')) : blocks.length - 1;
      dropImageFile(file, Number.isFinite(idx) ? idx : blocks.length - 1);
    },
    [dropImageFile, blocks.length],
  );

  const insertAbsoluteAt = useCallback(
    (point: WorldPoint, block: Block) => {
      const flowRoot = editorRef.current
        ?.closest('.stage-world')
        ?.querySelector('.stage-flow-column') as HTMLElement | null;
      const index = findInsertIndexForWorldY(flowRoot, point.y, blocks.length);
      const next = [...blocks];
      next.splice(index, 0, block);
      onChange(next);
      return block;
    },
    [blocks, onChange],
  );

  const onBlankDoubleClick = useCallback(
    (point: WorldPoint) => {
      if (readOnly) return;
      setComposer(point);
      setActiveCanvas(null);
    },
    [readOnly],
  );

  const insertFromPicker = useCallback(
    (type: BlockType) => {
      if (!composer) return;
      const point = composer;
      setComposer(null);
      if (type === 'image') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
          void (async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
              const src = await handleImageFile(file, session, isGuest);
              const block = createAbsoluteBlock('image', point.x, point.y) as ImageBlock;
              block.src = src;
              insertAbsoluteAt(point, block);
            } catch {
              toast('error', '图片上传失败');
            }
          })();
        };
        input.click();
        return;
      }
      if (type !== 'sticky' && type !== 'link-preview') return;
      const block = createAbsoluteBlock(type as StageAbsoluteType, point.x, point.y);
      insertAbsoluteAt(point, block);
      setFocusBlockId(block.id);
    },
    [composer, insertAbsoluteAt, session, isGuest],
  );

  return (
    <StageViewport
      stage={stage}
      onStageChange={onStageChange ?? (() => {})}
      readOnly={readOnly}
      onBlankDoubleClick={onBlankDoubleClick}
      composer={
        composer && !readOnly ? (
          <StageBlockPicker
            point={composer}
            onDismiss={() => setComposer(null)}
            onInsertType={insertFromPicker}
          />
        ) : null
      }
      flow={
        <div
          className="block-editor"
          data-stage-interactive
          ref={editorRefCallback}
          onPaste={readOnly ? undefined : onPaste}
          onDrop={readOnly ? undefined : onEditorDrop}
          onDragOver={(e) => {
            if (
              e.dataTransfer.types.includes('Files') ||
              e.dataTransfer.types.includes('text/webbook-image-block')
            ) {
              e.preventDefault();
            }
          }}
        >
          {blocks.map((block, i) => {
            if (isAbsoluteBlock(block)) return null;
            if (isBlockHiddenByCollapse(blocks, collapsed, i)) return null;
            return (
              <div
                key={block.id}
                className={`block-row ${dragBlockIndex === i ? 'block-row-dragging' : ''}`}
                data-block-index={i}
                data-block-id={block.id}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('text/webbook-block-index')) {
                    e.preventDefault();
                    setDragBlockIndex(i);
                  } else if (e.dataTransfer.types.includes('Files')) {
                    e.preventDefault();
                  }
                }}
                onDragLeave={() => setDragBlockIndex((cur) => (cur === i ? null : cur))}
                onDrop={(e) => {
                  const file = e.dataTransfer.files?.[0];
                  if (file?.type.startsWith('image/')) {
                    e.preventDefault();
                    e.stopPropagation();
                    dropImageFile(file, i);
                    setDragBlockIndex(null);
                    return;
                  }
                  const fromStr = e.dataTransfer.getData('text/webbook-block-index');
                  if (!fromStr) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const from = Number(fromStr);
                  if (!Number.isFinite(from) || from === i) return;
                  moveBlock(from, i);
                  setDragBlockIndex(null);
                }}
              >
                {!readOnly && (
                  <button
                    type="button"
                    className="block-drag-handle"
                    title="拖拽调整块顺序"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/webbook-block-index', String(i));
                      e.dataTransfer.effectAllowed = 'move';
                      setDragBlockIndex(i);
                    }}
                    onDragEnd={() => setDragBlockIndex(null)}
                  >
                    ⠿
                  </button>
                )}
                <BlockView
                  block={block}
                  index={i}
                  patch={patch}
                  remove={remove}
                  readOnly={readOnly}
                  registerRef={registerRef}
                  onActivate={() => {
                    activeIndexRef.current = i;
                    setActiveCanvas(null);
                  }}
                  onInsertAfter={(type) => insertAt(i + 1, type ?? 'paragraph')}
                  onRemoveAt={() => removeAt(i)}
                  onFocusAt={focusBlockAt}
                  onSlashPick={(type) => applySlash(i, block.id, type)}
                  blocks={blocks}
                  activeCanvas={activeCanvas}
                  onActivateCanvas={activateCanvas}
                  onMigrateImageToCanvas={migrateImageToCanvas}
                  session={session}
                  isGuest={isGuest}
                  collapsed={collapsed}
                  onToggleHeadingCollapse={onToggleHeadingCollapse}
                />
                {!readOnly && <InsertRow onInsert={(t) => insertAt(i + 1, t)} />}
              </div>
            );
          })}
          {blocks.length === 0 && readOnly && <p className="muted">（空笔记）</p>}
        </div>
      }
      absolute={
        <>
          {blocks.map((block, i) => {
            if (!isAbsoluteBlock(block)) return null;
            if (isBlockHiddenByCollapse(blocks, collapsed, i)) return null;
            if (block.type === 'sticky') {
              return (
                <StickyBlockView
                  key={block.id}
                  block={block}
                  readOnly={readOnly}
                  autoFocus={focusBlockId === block.id}
                  onPatch={(p) => patch(block.id, p)}
                />
              );
            }
            if (block.type === 'image') {
              return (
                <AbsoluteImageBlockView
                  key={block.id}
                  block={block}
                  readOnly={readOnly}
                  onPatch={(p) => patch(block.id, p)}
                />
              );
            }
            if (block.type === 'link-preview') {
              return (
                <AbsoluteLinkBlockView
                  key={block.id}
                  block={block}
                  readOnly={readOnly}
                  autoFocus={focusBlockId === block.id}
                  onPatch={(p) => patch(block.id, p)}
                />
              );
            }
            return null;
          })}
        </>
      }
    />
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
  onActivate: () => void;
  onInsertAfter: (type?: BlockType) => void;
  onRemoveAt: () => void;
  onFocusAt: (index: number) => void;
  onSlashPick: (type: BlockType) => void;
  activeCanvas: { blockId: string; x: number; y: number } | null;
  onActivateCanvas: (blockId: string, x: number, y: number) => void;
  onMigrateImageToCanvas: (
    payload: ImageBlockDragPayload,
    canvasBlockId: string,
    x: number,
    y: number,
  ) => void;
  session: { token: string } | null;
  isGuest: boolean;
  collapsed: ReadonlySet<string>;
  onToggleHeadingCollapse?: (headingId: string) => void;
}

function BlockView({
  block,
  index,
  blocks,
  patch,
  remove,
  readOnly,
  registerRef,
  onActivate,
  onInsertAfter,
  onRemoveAt,
  onFocusAt,
  onSlashPick,
  activeCanvas,
  onActivateCanvas,
  onMigrateImageToCanvas,
  session,
  isGuest,
  collapsed,
  onToggleHeadingCollapse,
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
          {!ro && headingHasSectionBody(blocks, index) && onToggleHeadingCollapse && (
            <button
              type="button"
              className="heading-collapse-btn"
              aria-expanded={!collapsed.has(block.id)}
              title={collapsed.has(block.id) ? '展开本节' : '折叠本节'}
              onClick={() => onToggleHeadingCollapse(block.id)}
            >
              {collapsed.has(block.id) ? '▸' : '▾'}
            </button>
          )}
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
              onActivate={onActivate}
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
                onActivate={onActivate}
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
              onActivate={onActivate}
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
              onActivate={onActivate}
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
          <ImageBlockView
            blockId={block.id}
            block={block}
            readOnly={ro}
            onPatch={(p) => patch(block.id, p)}
            uploadRow={<ImageUploadRow onUploaded={(src) => patch(block.id, { src })} />}
          />
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
              onActivate={onActivate}
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
            isActive={activeCanvas?.blockId === block.id}
            onActivate={(x, y) => onActivateCanvas(block.id, x, y)}
            onImageBlockDrop={(payload, x, y) => onMigrateImageToCanvas(payload, block.id, x, y)}
            session={session}
            isGuest={isGuest}
          />
          {delBtn}
        </div>
      );

    case 'sticky':
      return (
        <div className="block block-sticky-placeholder muted">
          <span>📌 便签（覆层，见画布）</span>
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
