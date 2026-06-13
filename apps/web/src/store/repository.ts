import type { Note, NoteTree } from '@webbook/shared';
import { localStore } from '@/lib/storage';
import { apiClient } from '@/lib/api';
import type { Session } from '@/auth/types';

/**
 * 仓库门面：
 * - 登录用户：远端完整读写（Workers→私有 GitHub）
 * - 游客：远端只读公开内容 + 本地 IndexedDB 草稿
 */
export function makeRepository(session: Session | null) {
  const token = session?.token;
  const authed = Boolean(token);

  return {
    authed,
    async loadTree(): Promise<NoteTree> {
      if (authed && token) {
        try {
          return await apiClient.loadTree(token);
        } catch {
          return localStore.loadTree();
        }
      }
      // 游客：优先拉取公开树，失败回退本地
      try {
        return await apiClient.loadPublicTree();
      } catch {
        return localStore.loadTree();
      }
    },
    async saveTree(tree: NoteTree): Promise<void> {
      await localStore.saveTree(tree);
      if (authed && token) {
        try {
          await apiClient.saveTree(tree, token);
        } catch {
          /* 离线/失败：已写本地 */
        }
      }
    },
    async loadNote(id: string): Promise<Note | undefined> {
      if (authed && token) {
        try {
          return await apiClient.loadNote(id, token);
        } catch {
          return localStore.loadNote(id);
        }
      }
      try {
        return await apiClient.loadPublicNote(id);
      } catch {
        return localStore.loadNote(id);
      }
    },
    async saveNote(note: Note): Promise<void> {
      await localStore.saveNote(note);
      if (authed && token) {
        try {
          await apiClient.saveNote(note, token);
        } catch {
          /* fallthrough */
        }
      }
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
