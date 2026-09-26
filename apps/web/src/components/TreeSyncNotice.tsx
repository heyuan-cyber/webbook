import { useNotesStore } from '@/store/useNotesStore';

/**
 * 目录树同步状态提示。
 *
 * - 冲突待决（优先级更高）：本地改动已保留但未上传，由用户决定保留哪一份；
 * - 只读本地：云端目录不可用（读失败 / 服务端未提供 revision），远端写入已被禁止。
 */
export function TreeSyncNotice() {
  const conflict = useNotesStore((s) => s.treeConflict);
  const localOnly = useNotesStore((s) => s.treeLocalOnly);
  const keepServer = useNotesStore((s) => s.resolveTreeConflictKeepServer);
  const keepLocal = useNotesStore((s) => s.resolveTreeConflictKeepLocal);

  if (conflict) {
    return (
      <div className="tree-sync-notice tree-sync-conflict" role="alert">
        <div className="tree-sync-text">
          <strong>云端目录已被其他设备修改</strong>
          <span className="muted">
            你的目录改动已保留在本机，尚未上传。请选择保留哪一份。
          </span>
        </div>
        <div className="tree-sync-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void keepServer()}
          >
            保留云端版本
          </button>
          <button
            type="button"
            className="btn btn-sm tree-sync-danger"
            onClick={() => {
              if (
                window.confirm(
                  '将用本地目录覆盖云端目录，云端其他设备写入的目录结构会丢失。确定继续？',
                )
              ) {
                void keepLocal();
              }
            }}
          >
            用本地覆盖云端
          </button>
        </div>
      </div>
    );
  }

  if (!localOnly) return null;

  return (
    <div className="tree-sync-notice tree-sync-local" role="status">
      <div className="tree-sync-text">
        <strong>本地模式</strong>
        <span className="muted">
          云端目录不可用，目录改动只保存在本机，暂不会同步。
        </span>
      </div>
    </div>
  );
}
