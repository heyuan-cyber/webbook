import type { NoteTree, TreeNode, TreeNodeVisibility } from '@webbook/shared';

/** 过滤树：仅保留 public 笔记及通向它们的文件夹 */
export function filterPublicTree(tree: NoteTree): NoteTree {
  return { ...tree, roots: filterNodes(tree.roots) };
}

function filterNodes(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder') {
      const children = node.children ? filterNodes(node.children) : [];
      if (children.length > 0) {
        out.push({ ...node, children });
      }
    } else if (node.visibility === 'public') {
      out.push(node);
    }
  }
  return out;
}

/** 同步 note 可见性到树节点 */
export function syncNoteVisibility(
  tree: NoteTree,
  noteId: string,
  visibility: TreeNodeVisibility,
): NoteTree {
  return {
    ...tree,
    roots: patchVisibility(tree.roots, noteId, visibility),
  };
}

function patchVisibility(
  nodes: TreeNode[],
  noteId: string,
  visibility: TreeNodeVisibility,
): TreeNode[] {
  return nodes.map((n) => {
    if (n.kind === 'note' && (n.noteId ?? n.id) === noteId) {
      return { ...n, visibility };
    }
    if (n.children) {
      return { ...n, children: patchVisibility(n.children, noteId, visibility) };
    }
    return n;
  });
}

/** 从树中移除指定笔记节点（含空文件夹清理） */
export function removeNoteFromTree(tree: NoteTree, noteId: string): NoteTree {
  return { ...tree, roots: removeNoteNodes(tree.roots, noteId) };
}

function removeNoteNodes(nodes: TreeNode[], noteId: string): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of nodes) {
    if (n.kind === 'note' && (n.noteId ?? n.id) === noteId) continue;
    if (n.kind === 'folder') {
      const children = n.children ? removeNoteNodes(n.children, noteId) : [];
      if (children.length > 0) out.push({ ...n, children });
      continue;
    }
    out.push(n);
  }
  return out;
}
