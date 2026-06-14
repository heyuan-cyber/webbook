export const TREE_SCHEMA_VERSION = 1;

export type TreeNodeKind = 'folder' | 'note';

export type TreeNodeVisibility = 'private' | 'circle' | 'public';

export interface TreeNode {
  id: string;
  kind: TreeNodeKind;
  title: string;
  /** 仅 note 节点：指向 Note.id（通常同值） */
  noteId?: string;
  /** 仅 note 节点：与 Note.visibility 同步，便于树过滤 */
  visibility?: TreeNodeVisibility;
  children?: TreeNode[];
  /** 默认折叠状态（跨设备同步项） */
  collapsed?: boolean;
  icon?: string;
}

export interface NoteTree {
  schemaVersion: number;
  roots: TreeNode[];
}

export function createEmptyTree(): NoteTree {
  return { schemaVersion: TREE_SCHEMA_VERSION, roots: [] };
}

/** 深度优先查找节点 */
export function findNode(nodes: TreeNode[], id: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}
