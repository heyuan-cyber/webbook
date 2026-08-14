import { useEffect, useRef, useState } from 'react';
import type { BlockEdgeSide, Model3dBlock, NoteStage } from '@webbook/shared';
import { defaultCardSize, stageScale } from '@webbook/shared';
import { assetUrl } from '@/lib/api';
import { BlockAiPanel, type NoteAiAsset } from './BlockAiPanel';
import { StageBlockPorts } from './StageBlockPorts';
import type { LiveBlockGeometry } from './StageEdgesLayer';
import { toast } from '@/store/useToastStore';

const DRAG_THRESHOLD_PX = 5;

interface Props {
  block: Model3dBlock;
  readOnly?: boolean;
  selected?: boolean;
  showPorts?: boolean;
  stage: NoteStage;
  noteAssets?: NoteAiAsset[];
  onSelect: (additive?: boolean) => void;
  onPatch: (patch: Partial<Model3dBlock>) => void;
  onPortPointerDown: (side: BlockEdgeSide, e: React.PointerEvent) => void;
  onLiveGeometry?: (geo: LiveBlockGeometry | null) => void;
  liveOverride?: LiveBlockGeometry | null;
}

let modelViewerLoader: Promise<void> | null = null;
function ensureModelViewer(): Promise<void> {
  if (customElements.get('model-viewer')) return Promise.resolve();
  if (!modelViewerLoader) {
    modelViewerLoader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('model-viewer load failed'));
      document.head.appendChild(s);
    });
  }
  return modelViewerLoader;
}

export function AbsoluteModel3dBlockView({
  block,
  readOnly,
  selected,
  showPorts,
  stage,
  noteAssets,
  onSelect,
  onPatch,
  onPortPointerDown,
  onLiveGeometry,
  liveOverride,
}: Props) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const drag = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  const pl = block.placement;
  const defaults = defaultCardSize('model3d');
  const scale = stageScale(stage);
  const displayX = liveOverride?.x ?? pl?.x ?? 0;
  const displayY = liveOverride?.y ?? pl?.y ?? 0;
  const displayW = liveOverride?.width ?? pl?.width ?? defaults.width;
  const displayH = liveOverride?.height ?? pl?.height ?? defaults.height;
  const z = pl?.z ?? 1;
  const poster = block.poster ? assetUrl(block.poster) : '';
  const src = block.src ? assetUrl(block.src) : '';

  useEffect(() => {
    if (viewerOpen) void ensureModelViewer().catch(() => toast('error', '无法加载 3D 查看器'));
  }, [viewerOpen]);

  function onShellPointerDown(e: React.PointerEvent) {
    if (readOnly || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-stage-interactive]')) return;
    onSelect(e.shiftKey || e.metaKey || e.ctrlKey);
    const start = { x: e.clientX, y: e.clientY };
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: displayX,
      origY: displayY,
      moved: false,
    };
    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD_PX) {
        return;
      }
      d.moved = true;
      const dx = (ev.clientX - d.startX) / scale;
      const dy = (ev.clientY - d.startY) / scale;
      onLiveGeometry?.({
        x: d.origX + dx,
        y: d.origY + dy,
        width: displayW,
        height: displayH,
      });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const d = drag.current;
      drag.current = null;
      if (!d?.moved) {
        onLiveGeometry?.(null);
        return;
      }
      const dx = (ev.clientX - d.startX) / scale;
      const dy = (ev.clientY - d.startY) / scale;
      onPatch({
        placement: {
          mode: 'absolute',
          ...pl,
          x: d.origX + dx,
          y: d.origY + dy,
          width: displayW,
          height: displayH,
          scale: pl?.scale ?? 1,
        },
      });
      onLiveGeometry?.(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <>
      <div
        data-stage-block
        className={`stage-absolute-block stage-absolute-card ${selected ? 'is-selected' : ''}`}
        style={{ left: displayX, top: displayY, width: displayW, height: displayH, zIndex: z }}
        onPointerDown={onShellPointerDown}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (src) setViewerOpen(true);
          else toast('info', '尚无模型，请先生成或导入');
        }}
      >
        <div className="stage-card-body stage-model3d-body">
          {poster ? (
            <img src={poster} alt={block.caption || '3D'} className="stage-model3d-poster" />
          ) : (
            <div className="stage-model3d-empty muted">
              {src ? '双击打开 3D 预览' : '3D 模型（空）'}
            </div>
          )}
          <span className="stage-model3d-badge">3D</span>
        </div>
        <StageBlockPorts
          blockId={block.id}
          visible={Boolean(showPorts || selected) && !readOnly}
          onPortPointerDown={onPortPointerDown}
        />
      </div>
      {selected && !readOnly && (
        <BlockAiPanel
          kind="model3d"
          ai={block.ai}
          noteAssets={noteAssets}
          importLabel="导入 GLB"
          onImport={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.glb,model/gltf-binary';
            input.onchange = () => {
              const file = input.files?.[0];
              if (!file) return;
              const url = URL.createObjectURL(file);
              onPatch({ src: url, ai: { ...block.ai, source: 'upload', status: 'done' } });
              toast('info', '本地 GLB 仅本机预览；云端请用 AI 生成');
            };
            input.click();
          }}
          style={{
            left: displayX,
            top: displayY + displayH + 8,
            width: Math.max(displayW, 300),
            zIndex: z + 20,
          }}
          onAiChange={(next) => onPatch({ ai: next })}
          onModel3dResult={(url, posterUrl) =>
            onPatch({
              src: url,
              poster: posterUrl || block.poster,
              ai: { ...block.ai, status: 'done', source: 'ai' },
            })
          }
        />
      )}
      {viewerOpen && src && (
        <div
          className="model3d-viewer-overlay"
          data-stage-interactive
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setViewerOpen(false)}
        >
          <div className="model3d-viewer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="model3d-viewer-bar">
              <span>3D 预览</span>
              <button type="button" onClick={() => setViewerOpen(false)}>
                关闭
              </button>
            </div>
            {/* @ts-expect-error model-viewer web component */}
            <model-viewer
              src={src}
              alt={block.caption || '3D model'}
              camera-controls
              touch-action="pan-y"
              style={{ width: '100%', height: '70vh', background: '#1a1a1a' }}
            />
          </div>
        </div>
      )}
    </>
  );
}
