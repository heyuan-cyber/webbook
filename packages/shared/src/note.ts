import type { Block } from './blocks.js';

export const NOTE_SCHEMA_VERSION = 2;

export type NoteVisibility = 'public' | 'private';

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

export function createEmptyNote(id: string, title = '未命名笔记'): Note {
  const now = new Date().toISOString();
  return {
    schemaVersion: NOTE_SCHEMA_VERSION,
    id,
    title,
    blocks: [],
    visibility: 'private',
    createdAt: now,
    updatedAt: now,
  };
}

/** 旧数据迁移：补 visibility 默认值 */
export function normalizeNote(raw: Partial<Note> & { id: string }): Note {
  const now = new Date().toISOString();
  return {
    schemaVersion: raw.schemaVersion ?? NOTE_SCHEMA_VERSION,
    id: raw.id,
    title: raw.title ?? '未命名笔记',
    blocks: raw.blocks ?? [],
    visibility: raw.visibility ?? 'private',
    summary: raw.summary,
    tags: raw.tags,
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
  };
}
