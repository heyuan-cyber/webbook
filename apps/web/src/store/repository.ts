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
  /** 冲突未决：远端树写暂停，等用户决定保留哪一份（本地写不受影响） */
  let treeWriteBlocked = false;

  /* ── 目录写串行化 ──
   *
   * 目录是整文件覆盖写，两个并发 PUT 必然有一个带着过期 revision 撞 409——界面上的
   * 表现就是"云端目录已被其他设备修改"，哪怕只有这一台设备。所以同一时刻只允许一个
   * PUT 在飞；排队期间的新树只保留最新一份（后来的树是快照，本身已包含先前改动），
   * 等前一次写完成后带着新 revision 再发。
   */
  let queuedTree: NoteTree | null = null;
  let queuedDone: (() => void)[] = [];
  let queuedFail: ((e: unknown) => void)[] = [];
  /** 当前这一轮串行写；为 null 表示队列空闲 */
  let flushPromise: Promise<void> | null = null;

  async function loadTreeFromCloud(mirrorLocal = false): Promise<NoteTree> {
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
      treeWriteBlocked = false;
      // 只在"显式采用云端"时刷新本机副本（解决冲突 / 登录合并后）。
      // 普通的 init 不镜像：本机可能还存着待合并的游客目录，覆盖它就是丢草稿。
      if (mirrorLocal) await localStore.saveTree(loaded.tree);
      return loaded.tree;
    } catch {
      // 读失败不再静默升级为权威写：保留本地树，但禁止远端树写入
      localOnly = true;
      return localStore.loadTree();
    }
  }

  /** 结束当前排队：本地已经落盘，调用方只需知道"这一轮写完了" */
  function settleQueue(error?: unknown) {
    const done = queuedDone;
    const fail = queuedFail;
    queuedTree = null;
    queuedDone = [];
    queuedFail = [];
    if (error) fail.forEach((reject) => reject(error));
    else done.forEach((resolve) => resolve());
  }

  /**
   * 串行发送排队中的目录写：同一时刻只有一个 PUT 在飞。
   * 期间的多次调用共用同一轮 flush（后面的树会覆盖 queuedTree，只写最新一份）。
   */
  function flushTreeWrites(): Promise<void> {
    if (!flushPromise) {
      flushPromise = runFlush().finally(() => {
        flushPromise = null;
      });
    }
    return flushPromise;
  }

  /** 等当前排队中的目录写结束（队列空闲时立即返回） */
  async function waitForTreeWrites(): Promise<void> {
    while (flushPromise) await flushPromise;
  }

  async function runFlush(): Promise<void> {
    const authToken = token;
    if (!authToken) return;
    while (queuedTree && !treeWriteBlocked && !localOnly) {
      const tree = queuedTree;
      const done = queuedDone;
      const fail = queuedFail;
      queuedTree = null;
      queuedDone = [];
      queuedFail = [];
      try {
        const res = await apiClient.saveTree(tree, treeRev, authToken);
        treeRev = res._rev;
        done.forEach((resolve) => resolve());
      } catch (e) {
        if (e instanceof TreeConflictError) {
          // 冲突：暂停后续远端写，排队中的请求一并交回调用方（由界面转入待决状态）
          treeWriteBlocked = true;
          fail.forEach((reject) => reject(e));
          settleQueue(e);
          return;
        }
        // 网络/权限错误：本地已保存，保持既有容忍行为，不打断编辑
        done.forEach((resolve) => resolve());
      }
    }
    // 已降级 / 被阻塞：不再发请求，放行等待者（本地已落盘）
    if (queuedTree) settleQueue();
  }

  return {
    authed,

    /** 当前持有的云端 revision（localOnly 时无意义） */
    getTreeRev: () => treeRev,
    /** 是否处于「只读本地」状态 */
    isLocalOnly: () => localOnly,

    loadTree: () => loadTreeFromCloud(),

    /** 冲突解决用：丢弃 localOnly 标记后强制重新读取云端目录，并把结果写回本机副本 */
    async reloadTree(): Promise<NoteTree> {
      localOnly = false;
      treeWriteBlocked = false;
      return loadTreeFromCloud(true);
    },

    /** 冲突待决：暂停远端树写（本地写、笔记写照常） */
    blockTreeWrites() {
      treeWriteBlocked = true;
    },

    /** 等当前排队中的目录写结束（覆盖写 / 恢复版本前调用，避免和在途写入互相撞版本） */
    waitForTreeWrites,

    /**
     * 保存目录树：**本地总是落盘**，远端按队列串行发送。
     * 远端冲突以 {@link TreeConflictError} 上抛，由调用方转入待决状态。
     */
    async saveTree(tree: NoteTree): Promise<void> {
      await localStore.saveTree(tree);
      const authToken = token;
      if (!authed || !authToken) return;
      // 只读本地：绝不把降级读来的树推回云端；冲突待决：等用户决定
      if (localOnly || treeWriteBlocked) return;
      await new Promise<void>((resolve, reject) => {
        queuedTree = tree;
        queuedDone.push(resolve);
        queuedFail.push(reject);
        void flushTreeWrites();
      });
    },

    /**
     * 以给定的 base revision 强制写入目录树（用户已确认「用本地覆盖云端」）。
     * 若期间云端又变了会再次抛出 TreeConflictError，由界面重新征询。
     */
    async overwriteTree(tree: NoteTree, baseRev: string | null): Promise<string | null> {
      // 覆盖写会推进 revision：必须等在途的目录写落定，否则两个请求会互相把对方变成过期版本
      await waitForTreeWrites();
      await localStore.saveTree(tree);
      if (!authed || !token) return null;
      const res = await apiClient.saveTree(tree, baseRev, token);
      treeRev = res._rev;
      localOnly = false;
      treeWriteBlocked = false;
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
