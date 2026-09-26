import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Block } from '@webbook/shared';
import { DEFAULT_NOTE_STAGE, isAbsoluteBlock } from '@webbook/shared';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useNotesStore } from '@/store/useNotesStore';
import { useEditorUiStore } from '@/store/useEditorUiStore';
import { BlockEditor } from './editor/BlockEditor';
import { BlogArticleView } from './blog/BlogArticleView';
import { OutlinePanel } from './editor/OutlinePanel';
import { centerStageOn } from './editor/StageViewport';
import { AiChatPanel } from './AiChatPanel';
import { NoteHistoryPanel } from './NoteHistoryPanel';
import { toast } from '@/store/useToastStore';
import { outlineCollapseState, layoutUiState } from '@/lib/storage';

export function NoteEditor({ readOnly = false }: { readOnly?: boolean }) {
  const { id } = useParams();
  const isMobile = useIsMobile();
  const activeNote = useNotesStore((s) => s.activeNote);
  const treeReady = useNotesStore((s) => s.treeReady);
  const treeLoading = useNotesStore((s) => s.treeLoading);
  const noteLoading = useNotesStore((s) => s.noteLoading);
  const selectNote = useNotesStore((s) => s.selectNote);
  // 标题输入框在顶栏（NoteTitleTop），这里仍要它来支持历史回滚
  const setActiveTitle = useNotesStore((s) => s.setActiveTitle);
  const updateActiveBlocks = useNotesStore((s) => s.updateActiveBlocks);
  const updateActiveEdges = useNotesStore((s) => s.updateActiveEdges);
  const updateActiveStage = useNotesStore((s) => s.updateActiveStage);
  // 预览开关与历史面板开关提升到 store：顶栏（NoteMetaBar）也要读写
  const preview = useEditorUiStore((s) => s.preview);
  const resetEditorUi = useEditorUiStore((s) => s.resetForNote);
  const historyOpen = useEditorUiStore((s) => s.historyOpen);
  const setHistoryOpen = useEditorUiStore((s) => s.setHistoryOpen);
  const [outlineCollapsed, setOutlineCollapsed] = useState<Record<string, boolean>>({});
  const [outlinePanelCollapsed, setOutlinePanelCollapsed] = useState(
    () => layoutUiState.load().outlineCollapsed,
  );

  function toggleOutlinePanel() {
    setOutlinePanelCollapsed((c) => {
      const next = !c;
      layoutUiState.save({ outlineCollapsed: next });
      return next;
    });
  }
  useEffect(() => {
    if (!id) return;
    setOutlineCollapsed(outlineCollapseState.load(id));
  }, [id]);

  const collapsedHeadingIds = useMemo(
    () => new Set(Object.keys(outlineCollapsed).filter((k) => outlineCollapsed[k])),
    [outlineCollapsed],
  );

  function toggleHeadingCollapse(headingId: string) {
    if (!id) return;
    setOutlineCollapsed((prev) => {
      const next = { ...prev, [headingId]: !prev[headingId] };
      outlineCollapseState.save(id, next);
      return next;
    });
  }

  function onSelectOutlineBlock(blockIndex: number) {
    if (!activeNote) return;
    const block = activeNote.blocks[blockIndex];
    if (!block) return;
    const stage = activeNote.stage ?? DEFAULT_NOTE_STAGE;
    if (isAbsoluteBlock(block) && block.placement) {
      updateActiveStage(
        centerStageOn(stage, block.placement.x ?? 0, block.placement.y ?? 0),
      );
      return;
    }
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-block-index="${blockIndex}"]`) as HTMLElement | null;
      if (!row) return;
      const y = row.offsetTop + row.offsetHeight / 2;
      updateActiveStage({ ...stage, viewCenterY: y });
    });
  }

  useEffect(() => {
    if (!id || !treeReady) return;
    void selectNote(id);
  }, [id, treeReady, selectNote]);

  // 切换笔记时复位界面开关（预览 / 历史 / 更多），避免上一篇的状态串到这一篇
  useEffect(() => {
    resetEditorUi();
  }, [id, resetEditorUi]);

  if (!id) {
    return (
      <main className="editor empty">
        <div className="empty-state">
          <h2>欢迎使用 WebBook</h2>
          <p className="muted">
            {isMobile
              ? '点左上角「目录」按钮打开目录，选择或新建一篇笔记。'
              : '从左侧选择或新建一篇笔记。舞台：Ctrl+滚轮或按住左键+滚轮缩放画板，滚轮平移。'}
          </p>
        </div>
      </main>
    );
  }

  if (!activeNote) {
    return (
      <main className="editor">
        <div className="loading-state">
          <span className="spinner" aria-hidden />
          <p className="muted">
            {treeLoading || noteLoading ? '加载笔记…' : '未找到笔记'}
          </p>
        </div>
      </main>
    );
  }

  const showPreview = readOnly || preview;

  function isNoteEffectivelyEmpty(blocks: Block[]): boolean {
    if (blocks.length !== 1) return false;
    const only = blocks[0];
    return only.type === 'paragraph' && !only.text.trim();
  }

  function applyAiBlocks(blocks: Block[], mode: 'replace' | 'append') {
    if (!activeNote || !blocks.length) return;
    if (mode === 'replace') {
      updateActiveBlocks(blocks);
      toast('success', '已替换笔记内容');
      return;
    }
    const base = isNoteEffectivelyEmpty(activeNote.blocks) ? [] : activeNote.blocks;
    updateActiveBlocks([...base, ...blocks]);
    toast('success', '已追加到笔记末尾');
  }

  return (
    <main
      className={`editor editor-with-ai editor-workbench ${showPreview ? 'editor-preview' : ''}`}
    >
      {/* 标题与元信息都已在顶栏（NoteTitleTop / NoteMetaBar）——
          正文从这里直接开始，竖向空间不再被笔记头吃掉。
          版本历史面板仍渲染在这里（顶栏按钮只负责开关）。 */}
      {!readOnly && (
        <NoteHistoryPanel
          noteId={activeNote.id}
          compact
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          onRestore={(note) => {
            setActiveTitle(note.title);
            updateActiveBlocks(note.blocks);
            updateActiveEdges(note.edges ?? []);
          }}
        />
      )}
      {activeNote.summary && (
        <div className="ai-summary">
          <strong>AI 摘要：</strong> {activeNote.summary}
        </div>
      )}
      <div className="editor-body">
        <OutlinePanel
          blocks={activeNote.blocks}
          collapsed={outlineCollapsed}
          onToggleCollapse={toggleHeadingCollapse}
          onSelectBlock={onSelectOutlineBlock}
          readOnly={showPreview}
          panelCollapsed={outlinePanelCollapsed}
          onTogglePanel={toggleOutlinePanel}
        />
        {showPreview ? (
          <div className="editor-blog-preview">
            <BlogArticleView blocks={activeNote.blocks} />
          </div>
        ) : (
          <BlockEditor
            blocks={activeNote.blocks}
            onChange={updateActiveBlocks}
            edges={activeNote.edges ?? []}
            onEdgesChange={updateActiveEdges}
            readOnly={false}
            stage={activeNote.stage ?? DEFAULT_NOTE_STAGE}
            onStageChange={updateActiveStage}
            collapsedHeadingIds={collapsedHeadingIds}
            onToggleHeadingCollapse={toggleHeadingCollapse}
          />
        )}
      </div>
      {!readOnly && (
        <AiChatPanel
          note={activeNote}
          disabled={showPreview}
          onApplyBlocks={applyAiBlocks}
        />
      )}
    </main>
  );
}
