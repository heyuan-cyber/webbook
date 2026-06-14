import type { Env } from './env';
import { getFile, putFile, listDirectory } from './github';
import type { NoteTree } from '@webbook/shared';
import {
  LEGACY_NOTE_PATH,
  LEGACY_TREE_PATH,
  USER_NOTE_PATH,
  USER_TREE_PATH,
  mergeLegacyTree,
  collectTreeNoteIds,
  isTreeEmpty,
} from '@webbook/shared';
import { registerUser } from './usersRegistry';
import { removeNoteFromTree } from './tree-filter';

export interface LegacyMigrationResult {
  merged: boolean;
  notesCopied: number;
  notesSkipped: number;
  treeNodesAdded: number;
  legacyPruned: number;
  userTreePath: string;
}

function parseTree(raw: string | null): NoteTree | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as NoteTree;
  } catch {
    return null;
  }
}

/** 从 legacy 树移除已迁入用户目录的笔记节点（避免广场/管理后台重复） */
async function pruneLegacyTreeForNoteIds(
  env: Env,
  noteIds: Iterable<string>,
): Promise<number> {
  const legacyRaw = await getFile(env, LEGACY_TREE_PATH);
  if (!legacyRaw) return 0;
  let tree = parseTree(legacyRaw);
  if (!tree) return 0;
  const before = JSON.stringify(tree.roots);
  for (const noteId of noteIds) {
    tree = removeNoteFromTree(tree, noteId);
  }
  if (JSON.stringify(tree.roots) === before) return 0;
  await putFile(
    env,
    LEGACY_TREE_PATH,
    JSON.stringify(tree, null, 2),
    'migrate: prune legacy tree duplicates',
  );
  return 1;
}

/** 将 legacy tree + notes 合并到指定用户（幂等，可重复执行） */
export async function migrateLegacyToUser(
  env: Env,
  userId: string,
  email: string,
): Promise<LegacyMigrationResult> {
  const legacyRaw = await getFile(env, LEGACY_TREE_PATH);
  const legacyTree = parseTree(legacyRaw);

  const userRaw = await getFile(env, USER_TREE_PATH(userId));
  const userTree = parseTree(userRaw) ?? { schemaVersion: 1, roots: [] };

  let notesCopied = 0;
  let notesSkipped = 0;
  let treeNodesAdded = 0;

  if (legacyTree && !isTreeEmpty(legacyTree)) {
    const beforeIds = collectTreeNoteIds(userTree.roots);
    const merged = mergeLegacyTree(userTree, legacyTree);
    const afterIds = collectTreeNoteIds(merged.roots);
    treeNodesAdded = afterIds.size - beforeIds.size;

    for (const noteId of afterIds) {
      if (beforeIds.has(noteId)) continue;
      const userPath = USER_NOTE_PATH(userId, noteId);
      const existing = await getFile(env, userPath);
      if (existing) {
        notesSkipped++;
        continue;
      }
      const legacyNote = await getFile(env, LEGACY_NOTE_PATH(noteId));
      if (!legacyNote) continue;
      await putFile(
        env,
        userPath,
        legacyNote,
        `migrate: copy legacy note ${noteId} → user ${userId}`,
      );
      notesCopied++;
    }

    if (treeNodesAdded > 0 || isTreeEmpty(userTree)) {
      await registerUser(env, userId, email);
      await putFile(
        env,
        USER_TREE_PATH(userId),
        JSON.stringify(merged, null, 2),
        `migrate: merge legacy tree → user ${userId}`,
      );
    }
  }

  const finalUserRaw = await getFile(env, USER_TREE_PATH(userId));
  const finalUserTree = parseTree(finalUserRaw) ?? userTree;
  const legacyPruned = await pruneLegacyTreeForNoteIds(
    env,
    collectTreeNoteIds(finalUserTree.roots),
  );

  return {
    merged: treeNodesAdded > 0 || (legacyTree != null && isTreeEmpty(userTree)),
    notesCopied,
    notesSkipped,
    treeNodesAdded,
    legacyPruned,
    userTreePath: USER_TREE_PATH(userId),
  };
}

/** 列出 legacy notes 目录下所有 note id（用于诊断） */
export async function listLegacyNoteIds(env: Env): Promise<string[]> {
  const names = await listDirectory(env, 'data/notes');
  return names
    .filter((n) => n.endsWith('.json'))
    .map((n) => n.replace(/\.json$/, ''));
}
