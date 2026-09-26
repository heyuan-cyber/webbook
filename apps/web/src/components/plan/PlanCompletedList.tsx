import { useState } from 'react';
import type { PlanNode } from '@webbook/shared';
import { usePlanStore } from '@/store/usePlanStore';
import { PRIORITY_LABEL } from './PlanTaskTree';

type RangeKey = 'all' | '7' | '30';

const RANGES: { key: RangeKey; label: string; days?: number }[] = [
  { key: '7', label: '最近 7 天', days: 7 },
  { key: '30', label: '最近 30 天', days: 30 },
  { key: 'all', label: '全部' },
];

/**
 * 已完成栏：按完成时间倒序，可按时间范围收窄。
 *
 * 已完成任务从 TODO 栏移到这里，取消完成后回到 TODO 栏的原有父级位置
 * （还原由 plan 树结构本身保证，不需要额外记录）。
 */
export function PlanCompletedList({ tasks }: { tasks: PlanNode[] }) {
  const toggleDone = usePlanStore((s) => s.toggleDone);
  const [range, setRange] = useState<RangeKey>('7');

  const days = RANGES.find((r) => r.key === range)?.days;
  const done = flatten(tasks)
    .filter((n) => n.done)
    .filter((n) => {
      if (days === undefined) return true;
      if (!n.doneAt) return false;
      return Date.now() - new Date(n.doneAt).getTime() <= days * 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));

  return (
    <div className="plan-completed">
      <div className="plan-range">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            className={`btn btn-ghost btn-sm ${range === r.key ? 'is-active' : ''}`}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
        <span className="muted plan-range-count">{done.length} 条</span>
      </div>

      {done.length === 0 ? (
        <p className="muted plan-empty-hint">这个范围内没有已完成的任务。</p>
      ) : (
        <ul className="plan-completed-list">
          {done.map((node) => (
            <li key={node.id}>
              <label>
                <input
                  type="checkbox"
                  checked
                  aria-label={`取消完成「${node.title}」`}
                  onChange={() => toggleDone(node.id, false)}
                />
                <span className="plan-completed-title">{node.title}</span>
              </label>
              {node.priority !== 'none' && (
                <span className={`plan-priority p-${node.priority}`}>
                  {PRIORITY_LABEL[node.priority]}
                </span>
              )}
              <span className="plan-completed-at muted">{formatDoneAt(node.doneAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function flatten(nodes: PlanNode[]): PlanNode[] {
  const out: PlanNode[] = [];
  const walk = (list: PlanNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/** 完成时间：今天/昨天用相对说法，更早显示日期 */
function formatDoneAt(doneAt: string | undefined): string {
  if (!doneAt) return '完成时间未知';
  const at = new Date(doneAt);
  if (Number.isNaN(at.getTime())) return '完成时间未知';
  const today = new Date();
  const sameDay = at.toDateString() === today.toDateString();
  if (sameDay) {
    return `今天 ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (at.toDateString() === yesterday.toDateString()) return '昨天';
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(
    at.getDate(),
  ).padStart(2, '0')}`;
}
