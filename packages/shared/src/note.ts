import type { Block, BlockEdge } from './blocks.js';
import type { ParagraphBlock } from './blocks.js';
import type { NoteStage } from './blocks.js';
import { DEFAULT_NOTE_STAGE, edgeKey } from './blocks.js';
import { migrateRetiredContentBlocks } from './migrateBlocks.js';

export const NOTE_SCHEMA_VERSION = 5;

export type NoteVisibility = 'private' | 'circle' | 'public';

export interface Note {
  schemaVersion: number;
  id: string;
  title: string;
  blocks: Block[];
  /** 舞台有向连线 */
  edges?: BlockEdge[];
  /** 舞台相机；未设则使用默认中心 */
  stage?: NoteStage;
  /** 公开可被匿名访问；私密仅登录用户可读 */
  visibility: NoteVisibility;
  /** AI 归纳产出 */
  summary?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

function newParagraphId(): string {
  return `blk-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 新建笔记默认带一个空段落卡片，打开即可输入（约半屏高、更宽，可随内容增高） */
export function createDefaultParagraph(): ParagraphBlock {
  const width = 1200;
  const height = 400;
  return {
    id: newParagraphId(),
    type: 'paragraph',
    text: '',
    placement: {
      mode: 'absolute',
      x: -Math.round(width / 2),
      y: -Math.round(height / 2),
      z: 1,
      width,
      height,
    },
  };
}

function normalizeEdges(raw: BlockEdge[] | undefined, blocks: Block[]): BlockEdge[] {
  if (!raw?.length) return [];
  const ids = new Set(blocks.map((b) => b.id));
  const seen = new Set<string>();
  const out: BlockEdge[] = [];
  for (const e of raw) {
    if (!e?.id || !e.from || !e.to) continue;
    if (e.from === e.to) continue;
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    if (!['n', 'e', 's', 'w'].includes(e.fromSide) || !['n', 'e', 's', 'w'].includes(e.toSide)) {
      continue;
    }
    const k = edgeKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      id: e.id,
      from: e.from,
      to: e.to,
      fromSide: e.fromSide,
      toSide: e.toSide,
      fromT: e.fromT,
      toT: e.toT,
    });
  }
  return out;
}

export function createEmptyNote(id: string, title = '未命名笔记'): Note {
  const now = new Date().toISOString();
  return {
    schemaVersion: NOTE_SCHEMA_VERSION,
    id,
    title,
    blocks: [createDefaultParagraph()],
    edges: [],
    stage: { ...DEFAULT_NOTE_STAGE },
    visibility: 'private',
    createdAt: now,
    updatedAt: now,
  };
}

/** 旧数据迁移：补 visibility / edges；空 blocks 补默认段落；废除 list/checkbox/callout */
export function normalizeNote(raw: Partial<Note> & { id: string }): Note {
  const now = new Date().toISOString();
  const rawBlocks =
    raw.blocks && raw.blocks.length > 0 ? raw.blocks : [createDefaultParagraph()];
  const blocks = migrateRetiredContentBlocks(rawBlocks);
  return {
    schemaVersion: NOTE_SCHEMA_VERSION,
    id: raw.id,
    title: raw.title ?? '未命名笔记',
    blocks,
    edges: normalizeEdges(raw.edges, blocks),
    stage: raw.stage ?? { ...DEFAULT_NOTE_STAGE },
    visibility: raw.visibility ?? 'private',
    summary: raw.summary,
    tags: raw.tags,
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
  };
}
