import type { Note, NoteTree } from '@webbook/shared';
import { localStore } from '@/lib/storage';
import { apiClient } from '@/lib/api';
import type { Session } from '@/auth/types';

/**
 * 仓库门面：
 * - 登录用户：远端完整读写（Workers→私有 GitHub），失败回退本地
 * - 游客：仅 IndexedDB 本地读写，不请求网络（弱网可正常编辑）
 */
export function makeRepository(session: Session | null) {
  const token = session?.token;
  const authed = Boolean(token);

  return {
    authed,
    async loadTree(): Promise<NoteTree> {
      if (!authed) {
        return localStore.loadTree();
      }
      try {
        return await apiClient.loadTree(token);
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
      if (!authed) {
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
