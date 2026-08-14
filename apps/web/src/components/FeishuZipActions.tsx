import { useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useNotesStore } from '@/store/useNotesStore';
import { toast } from '@/store/useToastStore';
import {
  buildFeishuMarkdownZip,
  downloadBlob,
  importBlocksFromFeishuZip,
} from '@/lib/feishuZipIo';

/** 笔记顶栏：上传覆盖当前笔记 / 下载当前笔记同构 zip */
export function FeishuZipActions({ compact = false }: { compact?: boolean }) {
  const { session, isGuest } = useAuth();
  const activeNote = useNotesStore((s) => s.activeNote);
  const updateActiveBlocks = useNotesStore((s) => s.updateActiveBlocks);
  const setActiveTitle = useNotesStore((s) => s.setActiveTitle);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onPickZip(file: File | undefined) {
    if (!file) return;
    if (!activeNote) {
      toast('error', '请先打开一篇笔记再上传 zip');
      return;
    }
    setBusy(true);
    try {
      const { title, blocks, warnings } = await importBlocksFromFeishuZip(file, {
        session,
        isGuest,
      });
      updateActiveBlocks(blocks);
      if (title.trim()) setActiveTitle(title.trim());
      if (warnings.length) toast('error', `已覆盖当前笔记，但有 ${warnings.length} 个媒体警告`);
      else toast('success', '已用飞书 zip 覆盖当前笔记');
    } catch (e) {
      toast('error', (e as Error).message || '导入失败');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function onDownloadZip() {
    if (!activeNote) {
      toast('error', '请先打开一篇笔记');
      return;
    }
    setBusy(true);
    try {
      const blob = await buildFeishuMarkdownZip(activeNote);
      const name = `${(activeNote.title || 'note').replace(/[<>:"/\\|?*]/g, '_').slice(0, 60)}.zip`;
      downloadBlob(blob, name);
      toast('success', '已下载飞书同构 zip');
    } catch (e) {
      toast('error', (e as Error).message || '打包失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? 'feishu-zip-actions compact' : 'feishu-zip-actions'}>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => void onPickZip(e.target.files?.[0])}
      />
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={busy || !activeNote}
        onClick={() => inputRef.current?.click()}
        title="上传飞书 zip，整篇覆盖当前笔记"
      >
        {busy ? '处理中…' : '上传 zip'}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={busy || !activeNote}
        onClick={() => void onDownloadZip()}
        title="下载当前笔记的飞书同构 Markdown zip"
      >
        下载 zip
      </button>
    </div>
  );
}
