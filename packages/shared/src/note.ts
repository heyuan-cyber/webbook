import type { Block } from './blocks.js';
import type { ParagraphBlock } from './blocks.js';

export const NOTE_SCHEMA_VERSION = 2;

export type NoteVisibility = 'private' | 'circle' | 'public';

export interface Note {
  schemaVersion: number;
  id: string;
  title: string;
  blocks: Block[];
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

/** 新建笔记默认带一个空段落，打开即可输入 */
export function createDefaultParagraph(): ParagraphBlock {
  return { id: newParagraphId(), type: 'paragraph', text: '' };
}

export function createEmptyNote(id: string, title = '未命名笔记'): Note {
  const now = new Date().toISOString();
  return {
    schemaVersion: NOTE_SCHEMA_VERSION,
    id,
    title,
    blocks: [createDefaultParagraph()],
    visibility: 'private',
    createdAt: now,
    updatedAt: now,
  };
}

/** 旧数据迁移：补 visibility；空 blocks 补默认段落 */
export function normalizeNote(raw: Partial<Note> & { id: string }): Note {
  const now = new Date().toISOString();
  const blocks =
    raw.blocks && raw.blocks.length > 0 ? raw.blocks : [createDefaultParagraph()];
  return {
    schemaVersion: raw.schemaVersion ?? NOTE_SCHEMA_VERSION,
    id: raw.id,
    title: raw.title ?? '未命名笔记',
    blocks,
    visibility: raw.visibility ?? 'private',
    summary: raw.summary,
    tags: raw.tags,
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
  };
}
