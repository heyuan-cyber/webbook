import type { Block, BlockEdge, BlockPlacement } from '@webbook/shared';
import { isAbsoluteBlock } from '@webbook/shared';
import { uid } from '@/lib/id';

export const WEBBBOOK_BLOCKS_PREFIX = 'webbook-blocks:';

export type BlockClipboardPayload = {
  v: 1;
  blocks: Block[];
  edges: BlockEdge[];
  origin: { x: number; y: number };
};

let memoryClipboard: BlockClipboardPayload | null = null;

export function setBlockClipboardMemory(payload: BlockClipboardPayload | null) {
  memoryClipboard = payload;
}

export function getBlockClipboardMemory(): BlockClipboardPayload | null {
  return memoryClipboard;
}

function placementBox(pl: BlockPlacement): { x: number; y: number; w: number; h: number } {
  const w = (pl.width ?? 200) * (pl.scale ?? 1);
  const h = (pl.height ?? 80) * (pl.scale ?? 1);
  return { x: pl.x ?? 0, y: pl.y ?? 0, w, h };
}

/** 从选中 id 构建剪贴板（deep clone 结构，保留原 id 供粘贴时重映射） */
export function buildBlockClipboard(
  allBlocks: Block[],
  allEdges: BlockEdge[],
  selectedIds: ReadonlySet<string>,
): BlockClipboardPayload | null {
  if (selectedIds.size === 0) return null;
  const blocks = allBlocks
    .filter((b) => selectedIds.has(b.id))
    .map((b) => structuredClone(b) as Block);
  if (blocks.length === 0) return null;

  const edges = allEdges
    .filter((e) => selectedIds.has(e.from) && selectedIds.has(e.to))
    .map((e) => structuredClone(e) as BlockEdge);

  let minX = Infinity;
  let minY = Infinity;
  let hasAbs = false;
  for (const b of blocks) {
    if (!isAbsoluteBlock(b) || !b.placement) continue;
    hasAbs = true;
    const box = placementBox(b.placement);
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
  }

  return {
    v: 1,
    blocks,
    edges,
    origin: hasAbs ? { x: minX, y: minY } : { x: 0, y: 0 },
  };
}

export function serializeBlockClipboard(payload: BlockClipboardPayload): string {
  return WEBBBOOK_BLOCKS_PREFIX + JSON.stringify(payload);
}

export function parseBlockClipboardText(text: string | undefined | null): BlockClipboardPayload | null {
  if (!text?.startsWith(WEBBBOOK_BLOCKS_PREFIX)) return null;
  try {
    const raw = JSON.parse(text.slice(WEBBBOOK_BLOCKS_PREFIX.length)) as BlockClipboardPayload;
    if (raw?.v !== 1 || !Array.isArray(raw.blocks) || raw.blocks.length === 0) return null;
    return {
      v: 1,
      blocks: raw.blocks,
      edges: Array.isArray(raw.edges) ? raw.edges : [],
      origin: {
        x: Number(raw.origin?.x) || 0,
        y: Number(raw.origin?.y) || 0,
      },
    };
  } catch {
    return null;
  }
}

export async function writeBlockClipboard(payload: BlockClipboardPayload): Promise<void> {
  setBlockClipboardMemory(payload);
  const text = serializeBlockClipboard(payload);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // 仅内存；粘贴仍可用
  }
}

export function readBlockClipboardFromEvent(e: {
  clipboardData?: DataTransfer | null;
}): BlockClipboardPayload | null {
  const text = e.clipboardData?.getData('text/plain');
  return parseBlockClipboardText(text) ?? getBlockClipboardMemory();
}

/** 克隆到锚点：absolute 相对 origin 对齐到 anchor；flow 保持 flow */
export function cloneClipboardAtAnchor(
  payload: BlockClipboardPayload,
  anchor: { x: number; y: number },
): { blocks: Block[]; edges: BlockEdge[]; newIds: string[] } {
  const idMap = new Map<string, string>();
  const blocks: Block[] = [];

  for (const src of payload.blocks) {
    const newId = uid('blk');
    idMap.set(src.id, newId);
    const copy = structuredClone(src) as Block;
    copy.id = newId;

    if (isAbsoluteBlock(copy) && copy.placement) {
      const ox = copy.placement.x ?? 0;
      const oy = copy.placement.y ?? 0;
      copy.placement = {
        ...copy.placement,
        mode: 'absolute',
        x: anchor.x + (ox - payload.origin.x),
        y: anchor.y + (oy - payload.origin.y),
        z: (copy.placement.z ?? 1) + 1,
      };
    }

    blocks.push(copy);
  }

  const edges: BlockEdge[] = [];
  for (const e of payload.edges) {
    const from = idMap.get(e.from);
    const to = idMap.get(e.to);
    if (!from || !to || from === to) continue;
    edges.push({
      ...structuredClone(e),
      id: uid('edge'),
      from,
      to,
    });
  }

  return { blocks, edges, newIds: [...idMap.values()] };
}
