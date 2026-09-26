import type { Note, NoteTree } from '@webbook/shared';
import { localStore } from '@/lib/storage';
import { apiClient, TreeConflictError } from '@/lib/api';
import type { Session } from '@/auth/types';

/**
 * 仓库门面：
 * - 登录用户：远端完整读写（Workers→私有 GitHub），失败回退本地
 * - 游客：仅 IndexedDB 本地读写，不请求网络（弱网可正常编辑）
 *
 * 目录树的写入额外受「只读本地」状态约束：云端目录读失败、或服务端未提供
 * revision 时，远端树写入被禁止。**降级读出来的数据不得升格为权威写**——
 * 2026-09-26 的整树覆盖事故正是这条路径（读失败 → 静默用本地树 → 推回云端）。
 */
export function makeRepository(session: Session | null) {
  const token = session?.token;
  const authed = Boolean(token);

  /** 云端目录的 revision；成功读取或写入后更新 */
  let treeRev: string | null = null;
  /** 已登录，但云端目录不可安全写入（读失败 / 服务端未报告 revision） */
  let localOnly = false;

  async function loadTreeFromCloud(): Promise<NoteTree> {
    if (!authed || !token) {
      // 游客：远端目录对其只读，不进入 localOnly 语义
      return localStore.loadTree();
    }
    try {
      const loaded = await apiClient.loadTree(token);
      if (!loaded.revReported) {
        // 服务端没给 revision（旧版 Worker）：无法比对，按本地模式处理（fail-closed）
        treeRev = null;
        localOnly = true;
        return loaded.tree;
      }
      treeRev = loaded.rev;
      localOnly = false;
      return loaded.tree;
    } catch {
      // 读失败不再静默升级为权威写：保留本地树，但禁止远端树写入
      localOnly = true;
      return localStore.loadTree();
    }
  }

  return {
    authed,

    /** 当前持有的云端 revision（localOnly 时无意义） */
    getTreeRev: () => treeRev,
    /** 是否处于「只读本地」状态 */
    isLocalOnly: () => localOnly,

    loadTree: loadTreeFromCloud,

    /** 冲突解决用：丢弃 localOnly 标记后强制重新读取云端目录 */
    async reloadTree(): Promise<NoteTree> {
      localOnly = false;
      return loadTreeFromCloud();
    },

    async saveTree(tree: NoteTree): Promise<void> {
      await localStore.saveTree(tree);
      if (!authed || !token) return;
      // 只读本地：绝不把降级读来的树推回云端
      if (localOnly) return;
      try {
        const res = await apiClient.saveTree(tree, treeRev, token);
        treeRev = res._rev;
      } catch (e) {
        // 冲突必须上抛，交给界面让用户决定；其它错误（网络/权限）保持既有容忍行为，
        // 因为本地已经保存，且历史行为就是不因此打断编辑。
        if (e instanceof TreeConflictError) throw e;
      }
    },

    /**
     * 以给定的 base revision 强制写入目录树（用户已确认「用本地覆盖云端」）。
     * 若期间云端又变了会再次抛出 TreeConflictError，由界面重新征询。
     */
    async overwriteTree(tree: NoteTree, baseRev: string | null): Promise<string | null> {
      await localStore.saveTree(tree);
      if (!authed || !token) return null;
      const res = await apiClient.saveTree(tree, baseRev, token);
      treeRev = res._rev;
      localOnly = false;
      return res._rev;
    },

    async loadNote(id: string): Promise<Note | undefined> {
      if (!authed || !token) {
        return localStore.loadNote(id);
      }
      try {
        return await apiClient.loadNote(id, token);
      } catch {
        return localStore.loadNote(id);
      }
    },

    async saveNote(note: Note): Promise<{ noteOk: boolean }> {
      await localStore.saveNote(note);
      if (authed && token) {
        try {
          await apiClient.saveNote(note, token);
          return { noteOk: true };
        } catch {
          return { noteOk: false };
        }
      }
      return { noteOk: true };
    },

    async deleteNote(id: string): Promise<void> {
      await localStore.deleteNote(id);
      if (authed && token) {
        try {
          await apiClient.deleteNote(id, token);
        } catch {
          /* fallthrough */
        }
      }
    },
  };
}

export type Repository = ReturnType<typeof makeRepository>;
