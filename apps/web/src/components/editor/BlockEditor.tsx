import {
  useRef,
  useCallback,
  useState,
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type {
  Block,
  BlockEdge,
  BlockEdgeSide,
  BlockType,
  ImageBlock,
  NoteStage,
} from '@webbook/shared';
import { uid } from '@/lib/id';
import {
  DEFAULT_NOTE_STAGE,
  defaultCardSize,
  edgeKey,
  headingHasSectionBody,
  isAbsoluteBlock,
  isBlockHiddenByCollapse,
  oppositeSide,
  reorderBlocksByStagePosition,
} from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { createBlock, createAbsoluteBlock } from './blockFactory';
import { InsertMenu } from './InsertMenu';
import { SlashMenu } from './SlashMenu';
import {
  beginOptimisticImageUpload,
  revokeLocalImagePreview,
} from './imageUpload';
import { LinkPreviewBlockView } from './LinkPreviewBlockView';
import { handleBlockKeyDown, isEditableBlock } from './blockKeyboard';
import {
  convertBlock,
  headingLevelFromSlashQuery,
  isInPlaceSlashType,
  isSlashInput,
  slashFilter,
} from './slashCommand';
import { EditableMarkdownField } from './EditableMarkdownField';
import { ImageBlockView } from './ImageBlockView';
import { StickyBlockView } from './StickyBlockView';
import {
  AbsoluteImageBlockView,
  type ImageLayerAction,
} from './AbsoluteImageBlockView';
import { AbsoluteLinkBlockView } from './AbsoluteLinkBlockView';
import { AbsoluteCardBlockView, type EdgePanClient } from './AbsoluteCardBlockView';
import { StageEdgesLayer, type LiveBlockGeometry } from './StageEdgesLayer';
import { StageBlockPicker } from './StageBlockPicker';
import { StageViewport, type WorldRect } from './StageViewport';
import { findInsertIndexForWorldY, worldPointFromClient, type WorldPoint } from './stageCoords';
import { renderInlineMarkdown, renderMultilineMarkdown } from '@/lib/markdown';
import { toast } from '@/store/useToastStore';

/** 舞台插入选择器：双击空白，或拉线到空白松手 */
type StageComposer = {
  point: WorldPoint;
  wire?: { fromId: string; fromSide: BlockEdgeSide };
};

const WIRE_PICKER_DRAG_PX = 10;

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  edges?: BlockEdge[];
  onEdgesChange?: (edges: BlockEdge[]) => void;
  readOnly?: boolean;
  stage?: NoteStage;
  onStageChange?: (stage: NoteStage) => void;
  collapsedHeadingIds?: ReadonlySet<string>;
  onToggleHeadingCollapse?: (headingId: string) => void;
}

export function BlockEditor({
  blocks,
  onChange,
  edges: edgesProp,
  onEdgesChange,
  readOnly,
  stage: stageProp,
  onStageChange,
  collapsedHeadingIds,
  onToggleHeadingCollapse,
}: Props) {
  const stage = stageProp ?? DEFAULT_NOTE_STAGE;
  const edges = edgesProp ?? [];
  const collapsed = collapsedHeadingIds ?? new Set<string>();
  const { session, isGuest } = useAuth();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const focusRefs = useRef(new Map<string, HTMLElement>());
  const activeIndexRef = useRef<number | null>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const [dragBlockIndex, setDragBlockIndex] = useState<number | null>(null);
  const [composer, setComposer] = useState<StageComposer | null>(null);
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set<string>());
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [wire, setWire] = useState<{
    fromId: string;
    fromSide: BlockEdgeSide;
    x: number;
    y: number;
  } | null>(null);
  const wireRef = useRef(wire);
  wireRef.current = wire;
  const [livePlacements, setLivePlacements] = useState(
    () => new Map<string, LiveBlockGeometry>(),
  );
  const [edgePanClient, setEdgePanClient] = useState<EdgePanClient | null>(null);
  const edgePanClientRef = useRef(edgePanClient);
  edgePanClientRef.current = edgePanClient;
  const hasFlowBlocks = blocks.some((b) => !isAbsoluteBlock(b));

  const selectBlock = useCallback((id: string, additive?: boolean) => {
    setSelectedEdgeId(null);
    setSelectedIds((prev) => {
      if (additive) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      if (prev.has(id) && prev.size > 1) return prev;
      return new Set([id]);
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectedEdgeId(null);
  }, []);

  const setBlockLiveGeometry = useCallback(
    (blockId: string, geo: LiveBlockGeometry | null) => {
      if (!geo) {
        setLivePlacements((prev) => {
          if (prev.size > 1) {
            const latest = blocksRef.current;
            const nextBlocks = latest.map((b) => {
              const l = prev.get(b.id);
              if (!l || !b.placement || b.placement.mode !== 'absolute') return b;
              return {
                ...b,
                placement: {
                  ...b.placement,
                  x: l.x,
                  y: l.y,
                  width: l.width,
                  height: l.height,
                  scale: l.scale ?? 1,
                },
              } as Block;
            });
            queueMicrotask(() => onChange(reorderBlocksByStagePosition(nextBlocks)));
          }
          return new Map();
        });
        return;
      }

      const ids = selectedIdsRef.current;
      const primary = blocksRef.current.find((b) => b.id === blockId);
      if (
        primary?.placement?.mode === 'absolute' &&
        ids.has(blockId) &&
        ids.size > 1
      ) {
        const ox = primary.placement.x ?? 0;
        const oy = primary.placement.y ?? 0;
        const dx = geo.x - ox;
        const dy = geo.y - oy;
        setLivePlacements(() => {
          const next = new Map<string, LiveBlockGeometry>();
          for (const id of ids) {
            const b = blocksRef.current.find((x) => x.id === id);
            if (!b?.placement || b.placement.mode !== 'absolute') continue;
            if (id === blockId) {
              next.set(id, geo);
            } else {
              const scale = b.placement.scale ?? 1;
              next.set(id, {
                x: (b.placement.x ?? 0) + dx,
                y: (b.placement.y ?? 0) + dy,
                width: (b.placement.width ?? 200) * scale,
                height: (b.placement.height ?? 80) * scale,
                scale: 1,
              });
            }
          }
          return next;
        });
        return;
      }

      setLivePlacements((prev) => {
        const cur = prev.get(blockId);
        if (
          cur &&
          cur.x === geo.x &&
          cur.y === geo.y &&
          cur.width === geo.width &&
          cur.height === geo.height &&
          (cur.scale ?? 1) === (geo.scale ?? 1)
        ) {
          return prev;
        }
        const next = new Map(prev);
        next.set(blockId, geo);
        return next;
      });
    },
    [onChange],
  );

  const applyMarqueeSelection = useCallback((rect: WorldRect) => {
    const hit = new Set<string>();
    for (const b of blocksRef.current) {
      if (!isAbsoluteBlock(b) || !b.placement) continue;
      const scale = b.placement.scale ?? 1;
      const x = b.placement.x ?? 0;
      const y = b.placement.y ?? 0;
      const w = (b.placement.width ?? 200) * scale;
      const h = (b.placement.height ?? 80) * scale;
      const intersects =
        !(x + w < rect.minX || x > rect.maxX || y + h < rect.minY || y > rect.maxY);
      if (intersects) hit.add(b.id);
    }
    setSelectedIds(hit);
    setSelectedEdgeId(null);
  }, []);

  const deleteEdge = useCallback(
    (id: string) => {
      if (!onEdgesChange) return;
      onEdgesChange(edgesRef.current.filter((ed) => ed.id !== id));
      setSelectedEdgeId((cur) => (cur === id ? null : cur));
    },
    [onEdgesChange],
  );

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
    const prev = blocks.find((b) => b.id === id);
    const next = blocks.map((b) => (b.id === id ? ({ ...b, ...patchBlock } as Block) : b));
    const pl = patchBlock.placement;
    const movedXY =
      Boolean(pl) &&
      Boolean(prev?.placement) &&
      ((pl!.x !== undefined && pl!.x !== prev!.placement!.x) ||
        (pl!.y !== undefined && pl!.y !== prev!.placement!.y));
    onChange(movedXY ? reorderBlocksByStagePosition(next) : next);
  }

  function layerAbsolute(blockId: string, action: ImageLayerAction) {
    const ranked = blocks
      .filter(isAbsoluteBlock)
      .map((b) => ({ id: b.id, z: b.placement?.z ?? 1 }))
      .sort((a, b) => a.z - b.z);
    const idx = ranked.findIndex((r) => r.id === blockId);
    if (idx < 0) return;
    const self = blocks.find((b) => b.id === blockId);
    if (!self?.placement) return;

    if (action === 'front') {
      const maxZ = ranked[ranked.length - 1]!.z;
      patch(blockId, {
        placement: { ...self.placement, mode: 'absolute', z: maxZ + 1 },
      } as Partial<Block>);
      return;
    }
    if (action === 'back') {
      const minZ = ranked[0]!.z;
      patch(blockId, {
        placement: { ...self.placement, mode: 'absolute', z: minZ - 1 },
      } as Partial<Block>);
      return;
    }

    const swapWith =
      action === 'forward' && idx < ranked.length - 1
        ? ranked[idx + 1]
        : action === 'backward' && idx > 0
          ? ranked[idx - 1]
          : null;
    if (!swapWith) return;
    const zMe = ranked[idx]!.z;
    const zOther = swapWith.z;
    onChange(
      blocks.map((b) => {
        if (b.id === blockId && b.placement) {
          return { ...b, placement: { ...b.placement, z: zOther } } as Block;
        }
        if (b.id === swapWith.id && b.placement) {
          return { ...b, placement: { ...b.placement, z: zMe } } as Block;
        }
        return b;
      }),
    );
  }

  function remove(id: string) {
    const next = blocks.filter((b) => b.id !== id);
    onChange(next.length ? next : [createAbsoluteBlock('paragraph', -140, -48)]);
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  }

  function removeSelected() {
    const ids = selectedIdsRef.current;
    if (ids.size === 0) return;
    const next = blocksRef.current.filter((b) => !ids.has(b.id));
    onChange(next.length ? next : [createAbsoluteBlock('paragraph', -140, -48)]);
    setSelectedIds(new Set());
  }

  function duplicateStageImage(blockId: string) {
    if (readOnly) return;
    const srcBlock = blocks.find((b) => b.id === blockId && b.type === 'image');
    if (!srcBlock || srcBlock.type !== 'image') return;
    const pl = srcBlock.placement ?? { mode: 'absolute' as const, x: 0, y: 0 };
    const copy: ImageBlock = {
      ...srcBlock,
      id: uid('blk'),
      placement: {
        ...pl,
        mode: 'absolute',
        x: (pl.x ?? 0) + 24,
        y: (pl.y ?? 0) + 24,
        z: (pl.z ?? 1) + 1,
      },
    };
    const idx = blocks.findIndex((b) => b.id === blockId);
    const next = [...blocks];
    next.splice(idx + 1, 0, copy);
    onChange(next);
    setSelectedIds(new Set([copy.id]));
  }

  const addEdge = useCallback(
    (from: string, to: string, fromSide: BlockEdgeSide, toSide: BlockEdgeSide) => {
      if (!onEdgesChange || from === to) return;
      const draft = { from, to, fromSide, toSide };
      const k = edgeKey(draft);
      if (edgesRef.current.some((e) => edgeKey(e) === k)) return;
      onEdgesChange([
        ...edgesRef.current,
        { id: uid('edge'), from, to, fromSide, toSide },
      ]);
    },
    [onEdgesChange],
  );

  const stageRefForWire = useRef(stage);
  stageRefForWire.current = stage;

  const onPortPointerDown = useCallback(
    (blockId: string, side: BlockEdgeSide, e: React.PointerEvent) => {
      if (readOnly || !onEdgesChange) return;
      const viewport = (e.target as HTMLElement).closest('.stage-viewport') as HTMLElement | null;
      const pt = worldPointFromClient(viewport, stageRefForWire.current, e.clientX, e.clientY);
      if (!pt) return;
      const startClient = { x: e.clientX, y: e.clientY };
      setComposer(null);
      setSelectedIds(new Set([blockId]));
      setSelectedEdgeId(null);
      setWire({ fromId: blockId, fromSide: side, x: pt.x, y: pt.y });
      setEdgePanClient({ clientX: e.clientX, clientY: e.clientY });

      function onMove(ev: PointerEvent) {
        setEdgePanClient({ clientX: ev.clientX, clientY: ev.clientY });
        const p = worldPointFromClient(viewport, stageRefForWire.current, ev.clientX, ev.clientY);
        if (!p) return;
        setWire((w) => (w ? { ...w, x: p.x, y: p.y } : null));
      }
      function onUp(ev: PointerEvent) {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        setEdgePanClient(null);
        const cur = wireRef.current;
        if (!cur) return;

        const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
        const port = el?.closest('[data-stage-port]') as HTMLElement | null;
        if (port) {
          setWire(null);
          const toId = port.getAttribute('data-port-block');
          const toSide = port.getAttribute('data-port-side') as BlockEdgeSide | null;
          if (!toId || !toSide) return;
          addEdge(cur.fromId, toId, cur.fromSide, toSide);
          return;
        }

        const dragged =
          Math.hypot(ev.clientX - startClient.x, ev.clientY - startClient.y) >= WIRE_PICKER_DRAG_PX;
        const release = worldPointFromClient(
          viewport,
          stageRefForWire.current,
          ev.clientX,
          ev.clientY,
        );
        if (!dragged || !release) {
          setWire(null);
          return;
        }

        // 空白松手：保留草稿线并打开块选择器
        setWire({ ...cur, x: release.x, y: release.y });
        setComposer({
          point: release,
          wire: { fromId: cur.fromId, fromSide: cur.fromSide },
        });
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [readOnly, onEdgesChange, addEdge],
  );

  useEffect(() => {
    if (!wireRef.current) return;
    const pointer = edgePanClientRef.current;
    if (!pointer) return;
    const viewport = document.querySelector('.stage-viewport') as HTMLElement | null;
    const p = worldPointFromClient(
      viewport,
      stage,
      pointer.clientX,
      pointer.clientY,
    );
    if (!p) return;
    setWire((w) => (w ? { ...w, x: p.x, y: p.y } : null));
  }, [stage.viewCenterX, stage.viewCenterY, stage.viewScale]);

  useEffect(() => {
    if (readOnly) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable ||
          t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT')
      ) {
        return;
      }
      if (selectedEdgeId && onEdgesChange) {
        e.preventDefault();
        onEdgesChange(edgesRef.current.filter((ed) => ed.id !== selectedEdgeId));
        setSelectedEdgeId(null);
        return;
      }
      if (selectedIdsRef.current.size > 0) {
        e.preventDefault();
        removeSelected();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readOnly, selectedEdgeId, onEdgesChange, blocks, onChange]);

  function applySlash(index: number, blockId: string, type: BlockType) {
    const block = blocks[index];
    if (!block) return;
    if (isInPlaceSlashType(type)) {
      const headingLevel =
        type === 'heading' && block.type === 'paragraph'
          ? headingLevelFromSlashQuery(slashFilter(block.text))
          : undefined;
      onChange(
        blocks.map((b) =>
          b.id === blockId ? convertBlock(block, type, { headingLevel }) : b,
        ),
      );
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
    const para = createAbsoluteBlock('paragraph', -140, -48);
    onChange([para]);
    setSelectedIds(new Set([para.id]));
    setFocusBlockId(para.id);
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

  const commitImageSrc = useCallback(
    (blockId: string, nextSrc: string, previewSrc: string) => {
      const latest = blocksRef.current;
      if (!latest.some((b) => b.id === blockId)) {
        revokeLocalImagePreview(previewSrc);
        return;
      }
      onChange(
        latest.map((b) =>
          b.id === blockId && b.type === 'image' ? { ...b, src: nextSrc } : b,
        ),
      );
      revokeLocalImagePreview(previewSrc);
    },
    [onChange],
  );

  const removeImageBlock = useCallback(
    (blockId: string, previewSrc?: string) => {
      const latest = blocksRef.current;
      if (!latest.some((b) => b.id === blockId)) {
        if (previewSrc) revokeLocalImagePreview(previewSrc);
        return;
      }
      const next = latest.filter((b) => b.id !== blockId);
      onChange(next.length ? next : [createAbsoluteBlock('paragraph', -140, -48)]);
      if (previewSrc) revokeLocalImagePreview(previewSrc);
    },
    [onChange],
  );

  const insertImageAt = useCallback(
    (src: string, atIndex?: number): string => {
      const imgBlock = createAbsoluteBlock('image', stage.viewCenterX - 140, stage.viewCenterY - 100) as ImageBlock;
      imgBlock.src = src;
      const latest = blocksRef.current;
      const base =
        atIndex ??
        (activeIndexRef.current !== null ? activeIndexRef.current + 1 : latest.length);
      const insertAt = Math.max(0, Math.min(base, latest.length));
      const next = [...latest];
      next.splice(insertAt, 0, imgBlock);
      onChange(next);
      setSelectedIds(new Set([imgBlock.id]));
      return imgBlock.id;
    },
    [onChange, stage.viewCenterX, stage.viewCenterY],
  );

  const insertImageOptimistic = useCallback(
    (file: File, atIndex?: number, failToast = '图片上传失败') => {
      const { previewSrc, finalize } = beginOptimisticImageUpload(file, session, isGuest);
      const blockId = insertImageAt(previewSrc, atIndex);
      void finalize()
        .then((src) => {
          commitImageSrc(blockId, src, previewSrc);
          if (isGuest) toast('info', '游客模式：图片仅存本地');
        })
        .catch(() => {
          toast('error', failToast);
          removeImageBlock(blockId, previewSrc);
        });
    },
    [session, isGuest, insertImageAt, commitImageSrc, removeImageBlock],
  );

  const editorRefCallback = useCallback(
    (el: HTMLDivElement | null) => {
      editorRef.current = el;
    },
    [],
  );

  const onPaste = useCallback(
    async (e: React.ClipboardEvent) => {
      if (readOnly) return;
      const file = e.clipboardData.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      e.preventDefault();
      insertImageOptimistic(file, undefined, '粘贴图片失败');
    },
    [insertImageOptimistic, readOnly],
  );

  const dropImageFile = useCallback(
    (file: File, blockIndex: number) => {
      insertImageOptimistic(file, blockIndex + 1, '拖入图片失败');
    },
    [insertImageOptimistic],
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

  const dismissComposer = useCallback(() => {
    setComposer(null);
    setWire(null);
  }, []);

  const onBlankDoubleClick = useCallback(
    (point: WorldPoint) => {
      if (readOnly) return;
      setWire(null);
      setComposer({ point });
    },
    [readOnly],
  );

  const connectWireToBlock = useCallback(
    (wireIntent: NonNullable<StageComposer['wire']>, blockId: string) => {
      addEdge(wireIntent.fromId, blockId, wireIntent.fromSide, oppositeSide(wireIntent.fromSide));
      setWire(null);
    },
    [addEdge],
  );

  const insertFromPicker = useCallback(
    (type: BlockType) => {
      if (!composer) return;
      const point = composer.point;
      const wireIntent = composer.wire;
      setComposer(null);
      if (type === 'canvas') {
        setWire(null);
        return;
      }

      const finishInsert = (block: Block) => {
        setSelectedIds(new Set([block.id]));
        if (wireIntent) connectWireToBlock(wireIntent, block.id);
        else setWire(null);
      };

      // 画板物件：absolute — 图片/视频先建空块，再导入或 AI，不强制文件选择器
      if (type === 'image' || type === 'video') {
        const size = defaultCardSize(type);
        const x = wireIntent ? point.x - size.width / 2 : point.x;
        const y = wireIntent ? point.y - size.height / 2 : point.y;
        const block = createAbsoluteBlock(type, x, y);
        insertAbsoluteAt({ x, y }, block);
        finishInsert(block);
        return;
      }

      // 图谱：双击点为左上角；拉线松手点为卡片中心
      const size = defaultCardSize(type);
      const x = wireIntent ? point.x - size.width / 2 : point.x;
      const y = wireIntent ? point.y - size.height / 2 : point.y;
      const block = createAbsoluteBlock(type, x, y);
      insertAbsoluteAt({ x, y }, block);
      finishInsert(block);
      setFocusBlockId(block.id);
    },
    [
      composer,
      insertAbsoluteAt,
      connectWireToBlock,
    ],
  );

  return (
    <StageViewport
      stage={stage}
      onStageChange={onStageChange ?? (() => {})}
      readOnly={readOnly}
      onBlankDoubleClick={onBlankDoubleClick}
      onPaste={readOnly ? undefined : onPaste}
      edgePanClient={edgePanClient}
      onBackgroundInteract={() => {
        clearSelection();
        if (composer?.wire) dismissComposer();
      }}
      onMarqueeEnd={readOnly ? undefined : applyMarqueeSelection}
      composerAt={composer?.point ?? null}
      composer={
        composer && !readOnly ? (
          <StageBlockPicker onDismiss={dismissComposer} onInsertType={insertFromPicker} />
        ) : null
      }
      flow={
        hasFlowBlocks ? (
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
                  }}
                  onInsertAfter={(type) => insertAt(i + 1, type ?? 'paragraph')}
                  onRemoveAt={() => removeAt(i)}
                  onFocusAt={focusBlockAt}
                  onSlashPick={(type) => applySlash(i, block.id, type)}
                  blocks={blocks}
                  collapsed={collapsed}
                  onToggleHeadingCollapse={onToggleHeadingCollapse}
                />
                {!readOnly && <InsertRow onInsert={(t) => insertAt(i + 1, t)} />}
              </div>
            );
          })}
          {blocks.length === 0 && readOnly && <p className="muted">（空笔记）</p>}
        </div>
        ) : null
      }
      absolute={
        <>
          <StageEdgesLayer
            blocks={blocks}
            edges={edges}
            stage={stage}
            selectedEdgeId={selectedEdgeId}
            wire={wire}
            livePlacements={livePlacements}
            onSelectEdge={(id) => {
              setSelectedEdgeId(id);
              setSelectedIds(new Set());
            }}
            onDeleteEdge={readOnly ? undefined : deleteEdge}
          />
          {blocks.map((block, i) => {
            if (!isAbsoluteBlock(block)) return null;
            if (isBlockHiddenByCollapse(blocks, collapsed, i)) return null;
            const selected = selectedIds.has(block.id);
            const portHandler = (side: BlockEdgeSide, e: React.PointerEvent) =>
              onPortPointerDown(block.id, side, e);
            const liveHandler = (geo: LiveBlockGeometry | null) =>
              setBlockLiveGeometry(block.id, geo);
            const liveOverride = livePlacements.get(block.id) ?? null;
            if (block.type === 'sticky') {
              return (
                <StickyBlockView
                  key={block.id}
                  block={block}
                  readOnly={readOnly}
                  selected={selected}
                  showPorts={Boolean(wire)}
                  autoFocus={focusBlockId === block.id}
                  stage={stage}
                  onSelect={(additive) => selectBlock(block.id, additive)}
                  onPatch={(p) => patch(block.id, p)}
                  onPortPointerDown={portHandler}
                  onLiveGeometry={liveHandler}
                  onEdgePanPointer={setEdgePanClient}
                  liveOverride={liveOverride}
                />
              );
            }
            if (block.type === 'image') {
              return (
                <AbsoluteImageBlockView
                  key={block.id}
                  block={block}
                  readOnly={readOnly}
                  selected={selected}
                  showPorts={Boolean(wire)}
                  stage={stage}
                  onSelect={(additive) => selectBlock(block.id, additive)}
                  onPatch={(p) => patch(block.id, p)}
                  onLayer={(action) => layerAbsolute(block.id, action)}
                  onDuplicate={() => duplicateStageImage(block.id)}
                  onDelete={() => remove(block.id)}
                  onPortPointerDown={portHandler}
                  onLiveGeometry={liveHandler}
                  onEdgePanPointer={setEdgePanClient}
                  liveOverride={liveOverride}
                />
              );
            }
            if (block.type === 'link-preview') {
              return (
                <AbsoluteLinkBlockView
                  key={block.id}
                  block={block}
                  readOnly={readOnly}
                  selected={selected}
                  showPorts={Boolean(wire)}
                  autoFocus={focusBlockId === block.id}
                  stage={stage}
                  onSelect={(additive) => selectBlock(block.id, additive)}
                  onPatch={(p) => patch(block.id, p)}
                  onPortPointerDown={portHandler}
                  onLiveGeometry={liveHandler}
                  onEdgePanPointer={setEdgePanClient}
                  liveOverride={liveOverride}
                />
              );
            }
            if (block.type === 'canvas') {
              return null;
            }
            return (
              <AbsoluteCardBlockView
                key={block.id}
                block={block}
                readOnly={readOnly}
                selected={selected}
                showPorts={Boolean(wire)}
                autoFocus={focusBlockId === block.id}
                stage={stage}
                onSelect={(additive) => selectBlock(block.id, additive)}
                onPatch={(p) => patch(block.id, p)}
                onPortPointerDown={portHandler}
                onLiveGeometry={liveHandler}
                onEdgePanPointer={setEdgePanClient}
                liveOverride={liveOverride}
              />
            );
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

    case 'divider':
      return (
        <div className="block block-divider">
          <hr />
          {delBtn}
        </div>
      );

    case 'canvas':
      return (
        <div className="block block-canvas-deprecated muted">
          <p>自由画布已废弃，请使用无限舞台摆放图片 / 便签 / 链接。</p>
          <p className="muted">可删除本块；内容不再交互编辑。</p>
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
    const { previewSrc, finalize } = beginOptimisticImageUpload(file, session, isGuest);
    onUploaded(previewSrc);
    setBusy(true);
    try {
      const src = await finalize();
      onUploaded(src);
      revokeLocalImagePreview(previewSrc);
      if (isGuest) toast('info', '游客模式：图片仅存本地');
      else toast('success', '图片已上传');
    } catch {
      onUploaded('');
      revokeLocalImagePreview(previewSrc);
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
