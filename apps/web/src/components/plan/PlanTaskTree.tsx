import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlanNode, TaskPriority, TreeNode } from '@webbook/shared';
import {
  PRIORITY_ORDER,
  TASK_PRIORITIES,
  computeProgress,
  countDescendantTasks,
  isOverdue,
  toDateString,
} from '@webbook/shared';
import {
  usePlanStore,
  type RemovedTaskLocation,
  type TaskDraft,
} from '@/store/usePlanStore';
import { planFoldState } from '@/lib/storage';
import { Icon } from '@/components/Icon';

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  p0: 'P0',
  p1: 'P1',
  p2: 'P2',
  none: '—',
};

type DropPos = 'before' | 'after' | 'child';

interface DropTarget {
  taskId: string;
  pos: DropPos;
}

/**
 * TODO 栏：可见任务的嵌套编辑树。
 *
 * 拖拽的下标始终按**未过滤的完整 plan** 计算（通过 usePlanStore.getState().plan 查真实兄弟列表），
 * 因为 TODO 栏会滤掉已完成任务，滤后下标与 plan 内下标不是一回事。
 */
export function PlanTaskTree({
  tasks,
  scopeKey,
  mobile,
  tree,
  scopeNodeId,
}: {
  tasks: PlanNode[];
  scopeKey: string;
  mobile: boolean;
  /** 笔记树，用于展示锚点名称与选择归属；所有 scope 都传 */
  tree?: TreeNode[];
  /**
   * 节点 scope 的节点 id；「全部任务」scope 为 undefined。
   * 在此 scope 创建的任务会被锚定到它——这样任务不会创建到一个用户再也看不到的地方。
   */
  scopeNodeId?: string;
}) {
  const plan = usePlanStore((s) => s.plan);
  const addTask = usePlanStore((s) => s.addTask);
  const setTitle = usePlanStore((s) => s.setTitle);
  const setNote = usePlanStore((s) => s.setNote);
  const setDueAt = usePlanStore((s) => s.setDueAt);
  const setPriority = usePlanStore((s) => s.setPriority);
  const toggleDone = usePlanStore((s) => s.toggleDone);
  const moveTask = usePlanStore((s) => s.moveTask);
  const deleteTask = usePlanStore((s) => s.deleteTask);
  const restoreTask = usePlanStore((s) => s.restoreTask);
  const setAnchor = usePlanStore((s) => s.setAnchor);

  const [folds, setFolds] = useState<Record<string, boolean>>(() => planFoldState.load(scopeKey));
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ removed: RemovedTaskLocation; label: string } | null>(null);
  const [adding, setAdding] = useState<{ parentTaskId: string | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ node: PlanNode } | null>(null);
  /** 正在为哪个任务挑选锚点（笔记/栏目） */
  const [anchorFor, setAnchorFor] = useState<string | null>(null);
  const undoIdRef = useRef(0);

  const nodeTitles = useMemo(() => {
    const map = new Map<string, string>();
    if (tree) {
      const walk = (nodes: TreeNode[]) => {
        for (const node of nodes) {
          map.set(node.id, node.title);
          walk(node.children ?? []);
        }
      };
      walk(tree);
    }
    return map;
  }, [tree]);

  useEffect(() => {
    setFolds(planFoldState.load(scopeKey));
  }, [scopeKey]);

  function toggleFold(taskId: string) {
    setFolds((prev) => {
      const next = { ...prev, [taskId]: !prev[taskId] };
      planFoldState.save(scopeKey, next);
      return next;
    });
  }

  const today = toDateString(new Date());
  const draggedIds = useMemo(
    () => (dragId ? descendantIdSet(plan.nodes, dragId) : new Set<string>()),
    [dragId, plan.nodes],
  );

  /** 判断落点是否合法：不能把任务拖进自己的子树 */
  function canDropOn(targetId: string): boolean {
    if (!dragId) return false;
    if (targetId === dragId) return false;
    return !draggedIds.has(targetId);
  }

  function handleDrop() {
    if (!dragId || !dropTarget) return;
    if (!canDropOn(dropTarget.taskId)) {
      setDragId(null);
      setDropTarget(null);
      return;
    }
    const real = usePlanStore.getState().plan.nodes;
    if (dropTarget.pos === 'child') {
      const target = findInPlan(real, dropTarget.taskId);
      moveTask(dragId, dropTarget.taskId, target ? target.children.length : 0);
    } else {
      const parentId = findParentId(real, dropTarget.taskId);
      const siblings = parentId ? (findInPlan(real, parentId)?.children ?? []) : real;
      const idx = siblings.findIndex((n) => n.id === dropTarget.taskId);
      if (idx >= 0) moveTask(dragId, parentId, dropTarget.pos === 'before' ? idx : idx + 1);
    }
    setDragId(null);
    setDropTarget(null);
  }

  /**
   * 无拖拽时的等价操作（手机端）：上移 / 下移 / 缩进 / 取消缩进。
   *
   * 上移下移按**当前视图的兄弟**计算（TODO 栏滤掉了已完成任务，与 plan 内下标不同），
   * 缩进挂到前一个兄弟下，取消缩进挂到祖父下、紧跟原父任务之后。
   */
  function moveByKeyboard(taskId: string, action: 'up' | 'down' | 'indent' | 'outdent') {
    const real = usePlanStore.getState().plan.nodes;
    const parentId = findParentId(real, taskId);
    const siblings = parentId ? (findInPlan(real, parentId)?.children ?? []) : real;
    const realIndex = siblings.findIndex((n) => n.id === taskId);
    if (realIndex < 0) return;

    if (action === 'up') {
      if (realIndex > 0) moveTask(taskId, parentId, realIndex - 1);
      return;
    }
    if (action === 'down') {
      if (realIndex < siblings.length - 1) moveTask(taskId, parentId, realIndex + 2);
      return;
    }
    if (action === 'indent') {
      const prev = siblings[realIndex - 1];
      if (!prev) return;
      moveTask(taskId, prev.id, prev.children.length);
      return;
    }
    // outdent：没有祖父可挂时保持原位
    if (parentId === null) return;
    const grandRaw = findParentIdRaw(real, parentId);
    if (grandRaw === undefined) return;
    const grandParentId = grandRaw;
    const grandSiblings = grandParentId
      ? (findInPlan(real, grandParentId)?.children ?? [])
      : real;
    const parentIndex = grandSiblings.findIndex((n) => n.id === parentId);
    if (parentIndex < 0) return;
    moveTask(taskId, grandParentId, parentIndex + 1);
  }

  function requestDelete(node: PlanNode) {
    const descendants = countDescendantTasks(node);
    if (descendants > 0) {
      setConfirmDelete({ node });
      return;
    }
    performDelete(node);
  }

  function performDelete(node: PlanNode) {
    const removed = deleteTask(node.id);
    setConfirmDelete(null);
    if (!removed) return;
    undoIdRef.current += 1;
    const id = undoIdRef.current;
    setUndo({ removed, label: node.title });
    window.setTimeout(() => {
      // 只清理属于本次删除的撤销条；期间又删了别的就交给新的那次
      if (undoIdRef.current === id) setUndo(null);
    }, 5000);
  }

  /**
   * 新任务的归属（锚点）：
   * - 子任务继承【父任务】的锚点，而不是取 scope。
   *   否则 spec 的「Anchor is independent of nesting」场景下会出现
   *   父任务可见、子任务无锚而不可见的断裂子树。
   * - 顶层任务取 scope 的节点 id；「全部任务」scope 下为空 ⇒ 落入未归类（收件箱）。
   */
  function anchorForNewTask(parentTaskId: string | null): string | undefined {
    if (!parentTaskId) return scopeNodeId;
    return findTaskAnchor(plan.nodes, parentTaskId) ?? scopeNodeId;
  }

  function submitNewTask(draft: TaskDraft) {
    const parentTaskId = adding?.parentTaskId ?? null;
    const anchorNodeId = anchorForNewTask(parentTaskId);
    addTask(parentTaskId, { ...draft, anchorNodeId });
    setAdding(null);
  }

  return (
    <div className="plan-tree">
      {undo && (
        <div className="plan-undo" role="status">
          <span className="plan-undo-text">已删除「{undo.label}」</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              restoreTask(undo.removed);
              setUndo(null);
            }}
          >
            撤销
          </button>
        </div>
      )}

      {tasks.length === 0 && !adding && (
        <div className="plan-empty">
          <p className="muted">这个范围还没有任务。</p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setAdding({ parentTaskId: null })}
          >
            添加第一个任务
          </button>
        </div>
      )}

      {tasks.map((node) => (
        <PlanTaskRow
          key={node.id}
          node={node}
          depth={0}
          today={today}
          mobile={mobile}
          folds={folds}
          editingId={editingId}
          dragId={dragId}
          dropTarget={dropTarget}
          canDropOn={canDropOn}
          onToggleFold={toggleFold}
          onStartEdit={setEditingId}
          onCommitTitle={(id, title) => {
            setTitle(id, title);
            setEditingId(null);
          }}
          onCancelEdit={() => setEditingId(null)}
          onSetNote={setNote}
          onSetDueAt={setDueAt}
          onSetPriority={setPriority}
          onToggleDone={toggleDone}
          onAddChild={(parentTaskId) => setAdding({ parentTaskId })}
          onDelete={requestDelete}
          onSetAnchor={setAnchor}
          onDragStart={(id) => setDragId(id)}
          onDragEnd={() => {
            setDragId(null);
            setDropTarget(null);
          }}
          onDragOver={(target) => setDropTarget(target)}
          onDrop={handleDrop}
          onMoveByAction={mobile ? moveByKeyboard : undefined}
          anchorTitle={
            node.anchorNodeId ? (nodeTitles.get(node.anchorNodeId) ?? '已绑定') : undefined
          }
          onRequestAnchor={tree ? () => setAnchorFor(node.id) : undefined}
          tree={tree}
        />      ))}

      {adding && (
        <TaskCreateForm
          depth={adding.parentTaskId ? 1 : 0}
          tree={tree}
          onCancel={() => setAdding(null)}
          onSubmit={submitNewTask}
        />
      )}

      {tasks.length > 0 && !adding && (
        <button
          type="button"
          className="btn btn-ghost btn-sm plan-add-root"
          onClick={() => setAdding({ parentTaskId: null })}
        >
          ＋ 添加任务
        </button>
      )}

      {confirmDelete && (
        <div className="plan-confirm" role="dialog" aria-label="确认删除任务">
          <p>
            删除「{confirmDelete.node.title}」将一并删除其下{' '}
            <strong>{countDescendantTasks(confirmDelete.node)}</strong> 条子任务，且无法恢复。
          </p>
          <div className="plan-confirm-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirmDelete(null)}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => performDelete(confirmDelete.node)}
            >
              删除
            </button>
          </div>
        </div>
      )}

      {anchorFor && tree && (
        <div className="plan-anchor-overlay" role="dialog" aria-label="绑定到笔记或栏目">
          <PlanScopePicker
            tree={tree}
            onPick={(nodeId) => {
              setAnchor(anchorFor, nodeId);
              setAnchorFor(null);
            }}
            onCancel={() => setAnchorFor(null)}
          />
        </div>
      )}
    </div>
  );
}

function PlanTaskRow({
  node,
  depth,
  today,
  mobile,
  folds,
  editingId,
  dragId,
  dropTarget,
  canDropOn,
  onToggleFold,
  onStartEdit,
  onCommitTitle,
  onCancelEdit,
  onSetNote,
  onSetDueAt,
  onSetPriority,
  onToggleDone,
  onAddChild,
  onDelete,
  onSetAnchor,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMoveByAction,
  anchorTitle,
  onRequestAnchor,
  tree,
}: {
  node: PlanNode;
  depth: number;
  today: string;
  mobile: boolean;
  folds: Record<string, boolean>;
  editingId: string | null;
  dragId: string | null;
  dropTarget: DropTarget | null;
  canDropOn: (targetId: string) => boolean;
  onToggleFold: (taskId: string) => void;
  onStartEdit: (taskId: string) => void;
  onCommitTitle: (taskId: string, title: string) => void;
  onCancelEdit: (taskId: string) => void;
  onSetNote: (taskId: string, note: string) => void;
  onSetDueAt: (taskId: string, dueAt: string | undefined) => void;
  onSetPriority: (taskId: string, priority: TaskPriority) => void;
  onToggleDone: (taskId: string, done: boolean) => void;
  onAddChild: (taskId: string) => void;
  onDelete: (node: PlanNode) => void;
  onSetAnchor: (taskId: string, anchorNodeId: string | undefined) => void;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  onDragOver: (target: DropTarget) => void;
  onDrop: () => void;
  /** 手机端：无拖拽时的四向移动 */
  onMoveByAction?: (taskId: string, action: 'up' | 'down' | 'indent' | 'outdent') => void;
  /** 已绑定的笔记/栏目标题；未归类为 undefined */
  anchorTitle?: string;
  /** 传入时该行可打开锚点选择器（设置或更改归属） */
  onRequestAnchor?: () => void;
  /** 笔记树，供详情面板内选择归属；未传则详情面板不提供归属编辑 */
  tree?: TreeNode[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(node.title);
  /** 详情面板内是否正在选择归属 */
  const [pickingAnchor, setPickingAnchor] = useState(false);
  const collapsed = folds[node.id] ?? false;
  const editing = editingId === node.id;
  const hasChildren = node.children.length > 0;
  const progress = computeProgress(node.children);
  const overdue = isOverdue(node, today);
  const isDropChild = dropTarget?.taskId === node.id && dropTarget.pos === 'child';
  const dropClass =
    dropTarget?.taskId === node.id && dropTarget.pos !== 'child' ? `drop-${dropTarget.pos}` : '';

  useEffect(() => {
    if (!editing) setDraft(node.title);
  }, [editing, node.title]);

  return (
    <div className="plan-node">
      {dropTarget?.taskId === node.id && dropTarget.pos === 'before' && canDropOn(node.id) && (
        <div className="plan-drop-line" />
      )}
      <div
        className={`plan-row ${dropClass} ${isDropChild ? 'drop-child' : ''} ${
          node.id === dragId ? 'is-dragging' : ''
        }`}
        style={{ paddingLeft: 6 + depth * 18 }}
        draggable={!editing}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/webbook-task', node.id);
          e.dataTransfer.effectAllowed = 'move';
          onDragStart(node.id);
        }}
        onDragEnd={onDragEnd}
        onDragOver={(e) => {
          if (!dragId || !canDropOn(node.id)) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientY - rect.top) / rect.height;
          // 上 1/4 落为兄弟前、下 1/4 落为兄弟后、中间落为子级
          const pos: DropPos = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'child';
          onDragOver({ taskId: node.id, pos });
        }}
        onDragLeave={() => {
          /* 由下一个 dragover 覆写落点，避免频繁闪动 */
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDrop();
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="plan-twisty"
            aria-label={collapsed ? '展开子任务' : '折叠子任务'}
            onClick={() => onToggleFold(node.id)}
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} size={12} />
          </button>
        ) : (
          <span className="plan-twisty leaf">·</span>
        )}

        <input
          type="checkbox"
          className="plan-check"
          checked={node.done}
          aria-label={`标记「${node.title}」${node.done ? '未完成' : '完成'}`}
          onChange={(e) => onToggleDone(node.id, e.target.checked)}
        />

        {editing ? (
          <input
            autoFocus
            className="plan-title-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onCommitTitle(node.id, draft.trim() || node.title)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setDraft(node.title);
                onCancelEdit(node.id);
              }
            }}
          />
        ) : (
          <button type="button" className="plan-title" onClick={() => onStartEdit(node.id)}>
            {node.title}
          </button>
        )}

        {hasChildren && (
          <span className="plan-progress muted" title="已完成 / 全部子任务">
            {progress.done}/{progress.total}
          </span>
        )}

        {node.dueAt && (
          <span className={`plan-due ${overdue ? 'overdue' : ''}`} title={overdue ? '已逾期' : '计划完成'}>
            {node.dueAt}
          </span>
        )}

        {node.priority !== 'none' && (
          <span className={`plan-priority p-${node.priority}`}>{PRIORITY_LABEL[node.priority]}</span>
        )}

        {anchorTitle !== undefined ? (
          <button
            type="button"
            className="plan-anchor-chip"
            title={`已绑定到「${anchorTitle}」，点击更换`}
            onClick={onRequestAnchor}
          >
            {anchorTitle}
          </button>
        ) : (
          onRequestAnchor && (
            <button
              type="button"
              className="plan-anchor-chip is-empty"
              title="绑定到笔记或栏目"
              onClick={onRequestAnchor}
            >
              未归类
            </button>
          )
        )}

        <span className="plan-tools">
          <button
            type="button"
            title="备注"
            aria-label="展开备注"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <Icon name="list" size={12} />
          </button>
          <button type="button" title="添加子任务" aria-label="添加子任务" onClick={() => onAddChild(node.id)}>
            <Icon name="plus" size={12} />
          </button>
          {mobile && onMoveByAction && (
            <>
              <button type="button" title="上移" aria-label="上移" onClick={() => onMoveByAction(node.id, 'up')}>
                <Icon name="arrow-up" size={12} />
              </button>
              <button type="button" title="下移" aria-label="下移" onClick={() => onMoveByAction(node.id, 'down')}>
                <Icon name="arrow-down" size={12} />
              </button>
              <button type="button" title="缩进" aria-label="缩进" onClick={() => onMoveByAction(node.id, 'indent')}>
                <Icon name="arrow-right" size={12} />
              </button>
              <button
                type="button"
                title="取消缩进"
                aria-label="取消缩进"
                onClick={() => onMoveByAction(node.id, 'outdent')}
              >
                <Icon name="arrow-left" size={12} />
              </button>
            </>
          )}
          <button type="button" title="删除" aria-label="删除任务" onClick={() => onDelete(node)}>
            <Icon name="trash" size={12} />
          </button>
        </span>
      </div>

      {expanded && (
        <div className="plan-detail" style={{ marginLeft: 24 + depth * 18 }}>
          <label className="plan-field">
            <span>备注</span>
            <textarea
              value={node.note ?? ''}
              placeholder="补充说明…"
              rows={2}
              onChange={(e) => onSetNote(node.id, e.target.value)}
            />
          </label>
          <div className="plan-field-row">
            <label className="plan-field">
              <span>计划完成</span>
              <input
                type="date"
                value={node.dueAt ?? ''}
                onChange={(e) => onSetDueAt(node.id, e.target.value || undefined)}
              />
            </label>
            <label className="plan-field">
              <span>优先级</span>
              <select
                value={node.priority}
                onChange={(e) => onSetPriority(node.id, e.target.value as TaskPriority)}
              >
                {[...TASK_PRIORITIES]
                  .sort((a, b) => PRIORITY_ORDER[a] - PRIORITY_ORDER[b])
                  .map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {tree && (
            <div className="plan-field">
              <span>归属</span>
              <div className="plan-anchor-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPickingAnchor(true)}
                >
                  {node.anchorNodeId ? '更改归属' : '设置归属'}
                </button>
                {node.anchorNodeId && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onSetAnchor(node.id, undefined)}
                  >
                    清除归属
                  </button>
                )}
              </div>
              <span className="muted plan-field-hint">
                {anchorTitle ? `当前：${anchorTitle}` : '当前：未归类（仅在全局任务中心的「未归类」中可见）'}
              </span>
              {pickingAnchor && (
                <div className="plan-anchor-overlay" role="dialog" aria-label="选择归属">
                  <PlanScopePicker
                    tree={tree}
                    onPick={(nodeId) => {
                      onSetAnchor(node.id, nodeId);
                      setPickingAnchor(false);
                    }}
                    onCancel={() => setPickingAnchor(false)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {hasChildren && !collapsed && (
        <div className="plan-children">
          {node.children.map((child) => (
            <PlanTaskRow
              key={child.id}
              node={child}
              depth={depth + 1}
              today={today}
              mobile={mobile}
              folds={folds}
              editingId={editingId}
              dragId={dragId}
              dropTarget={dropTarget}
              canDropOn={canDropOn}
              onToggleFold={onToggleFold}
              onStartEdit={onStartEdit}
              onCommitTitle={onCommitTitle}
              onCancelEdit={onCancelEdit}
              onSetNote={onSetNote}
              onSetDueAt={onSetDueAt}
              onSetPriority={onSetPriority}
              onToggleDone={onToggleDone}
              onAddChild={onAddChild}
              onDelete={onDelete}
              onSetAnchor={onSetAnchor}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onMoveByAction={onMoveByAction}
              anchorTitle={anchorTitle}
              onRequestAnchor={onRequestAnchor}
              tree={tree}
            />
          ))}
        </div>
      )}

      {dropTarget?.taskId === node.id && dropTarget.pos === 'after' && canDropOn(node.id) && (
        <div className="plan-drop-line" />
      )}
    </div>
  );
}

/** 某个任务的子树 id 集合（含自身） */
function descendantIdSet(nodes: PlanNode[], taskId: string): Set<string> {
  const found = findInPlan(nodes, taskId);
  const out = new Set<string>();
  if (!found) return out;
  const walk = (node: PlanNode) => {
    out.add(node.id);
    node.children.forEach(walk);
  };
  walk(found);
  return out;
}

function findInPlan(nodes: PlanNode[], taskId: string): PlanNode | undefined {
  for (const node of nodes) {
    if (node.id === taskId) return node;
    const found = findInPlan(node.children, taskId);
    if (found) return found;
  }
  return undefined;
}

/** 某任务当前的锚点（用于子任务继承父任务的归属） */
function findTaskAnchor(nodes: PlanNode[], taskId: string): string | undefined {
  return findInPlan(nodes, taskId)?.anchorNodeId;
}

function findParentId(nodes: PlanNode[], taskId: string): string | null {
  return findParentIdRaw(nodes, taskId) ?? null;
}

/** 与 findParentId 相同，但用 undefined 区分"找不到"与"在根级" */
function findParentIdRaw(nodes: PlanNode[], taskId: string): string | null | undefined {
  for (const node of nodes) {
    if (node.children.some((c) => c.id === taskId)) return node.id;
    const found = findParentIdRaw(node.children, taskId);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function TaskCreateForm({
  depth,
  tree,
  onCancel,
  onSubmit,
}: {
  depth: number;
  /** 传入时允许创建即绑定到某个笔记/栏目（全局任务中心用） */
  tree?: TreeNode[];
  onCancel: () => void;
  onSubmit: (draft: TaskDraft) => void;
}) {
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('none');
  const [anchor, setAnchor] = useState<{ id: string; title: string } | null>(null);
  const [picking, setPicking] = useState(false);

  const nodeTitles = useMemo(() => {
    const map = new Map<string, string>();
    if (tree) {
      const walk = (nodes: TreeNode[]) => {
        for (const node of nodes) {
          map.set(node.id, node.title);
          walk(node.children ?? []);
        }
      };
      walk(tree);
    }
    return map;
  }, [tree]);

  function submit() {
    if (!title.trim()) {
      onCancel();
      return;
    }
    onSubmit({
      title: title.trim(),
      dueAt: dueAt || undefined,
      priority,
      anchorNodeId: anchor?.id,
    });
  }

  return (
    <div className="plan-create" style={{ marginLeft: 6 + depth * 18 }}>
      <input
        autoFocus
        className="plan-title-input"
        placeholder="任务内容，回车创建"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
      <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
        {[...TASK_PRIORITIES]
          .sort((a, b) => PRIORITY_ORDER[a] - PRIORITY_ORDER[b])
          .map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
      </select>
      {tree && (
        <button
          type="button"
          className="plan-anchor-chip"
          title="绑定到笔记或栏目"
          onClick={() => setPicking(true)}
        >
          {anchor ? (
            <>
              <Icon name="file" size={12} />
              {anchor.title}
            </>
          ) : (
            '未归类'
          )}
        </button>
      )}
      <button type="button" className="btn btn-primary btn-sm" onClick={submit}>
        创建
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
        取消
      </button>

      {picking && tree && (
        <div className="plan-anchor-overlay" role="dialog" aria-label="绑定到笔记或栏目">
          <PlanScopePicker
            tree={tree}
            onPick={(nodeId) => {
              setAnchor({ id: nodeId, title: nodeTitles.get(nodeId) ?? '已绑定' });
              setPicking(false);
            }}
            onCancel={() => setPicking(false)}
          />
        </div>
      )}
    </div>
  );
}

/** 未归类任务的锚点选择器：把任务绑定到一个笔记或栏目 */
export function PlanScopePicker({
  tree,
  onPick,
  onCancel,
}: {
  tree: TreeNode[];
  onPick: (nodeId: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const options = useMemo(() => flattenTree(tree), [tree]);
  const filtered = query.trim()
    ? options.filter((o) => o.title.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div className="plan-scope-picker">
      <input
        autoFocus
        placeholder="搜索笔记或栏目…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
      />
      <ul>
        {filtered.slice(0, 30).map((option) => (
          <li key={option.id}>
            <button type="button" onClick={() => onPick(option.id)}>
              <span className="plan-scope-kind">
            <Icon name={option.kind === 'folder' ? 'folder' : 'file'} size={12} />
          </span>
              <span style={{ paddingLeft: option.depth * 10 }}>{option.title}</span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="muted">没有匹配的笔记或栏目</li>}
      </ul>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
        取消
      </button>
    </div>
  );
}

function flattenTree(
  nodes: TreeNode[],
  depth = 0,
): { id: string; title: string; kind: string; depth: number }[] {
  const out: { id: string; title: string; kind: string; depth: number }[] = [];
  for (const node of nodes) {
    out.push({ id: node.id, title: node.title, kind: node.kind, depth });
    if (node.children) out.push(...flattenTree(node.children, depth + 1));
  }
  return out;
}
