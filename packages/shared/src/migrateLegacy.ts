import type { NoteTree, TreeNode } from './tree.js';

/** 收集树中所有笔记 id */
export function collectTreeNoteIds(nodes: TreeNode[], out = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.kind === 'note') {
      out.add(node.noteId ?? node.id);
    }
    if (node.children?.length) collectTreeNoteIds(node.children, out);
  }
  return out;
}

/** 从 legacy 树中筛出用户树尚未包含的节点（保留文件夹结构） */
export function filterNewTreeNodes(nodes: TreeNode[], existing: Set<string>): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'note') {
      const noteId = node.noteId ?? node.id;
      if (!existing.has(noteId)) {
        result.push(node);
        existing.add(noteId);
      }
    } else {
      const children = filterNewTreeNodes(node.children ?? [], existing);
      if (children.length > 0) {
        result.push({ ...node, children });
      }
    }
  }
  return result;
}

/** 将 legacy 目录合并进用户目录（不重复 noteId） */
export function mergeLegacyTree(userTree: NoteTree, legacyTree: NoteTree): NoteTree {
  const seen = collectTreeNoteIds(userTree.roots);
  const added = filterNewTreeNodes(legacyTree.roots, seen);
  if (added.length === 0) return userTree;
  return {
    schemaVersion: userTree.schemaVersion ?? legacyTree.schemaVersion ?? 1,
    roots: [...userTree.roots, ...added],
  };
}

export function isTreeEmpty(tree: NoteTree | null | undefined): boolean {
  return !tree?.roots?.length;
}
