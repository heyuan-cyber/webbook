import type { PlanNode } from '@webbook/shared';
import { computePlanStats, RECENT_DONE_DAYS } from '@webbook/shared';

const PRIORITY_ROWS: { key: 'p0' | 'p1' | 'p2' | 'none'; label: string }[] = [
  { key: 'p0', label: 'P0 最高' },
  { key: 'p1', label: 'P1' },
  { key: 'p2', label: 'P2' },
  { key: 'none', label: '未设优先级' },
];

/**
 * 信息统计栏。
 *
 * 口径（design D7）：scope 内每条任务在每个指标里最多贡献 1，父子都计入——
 * 统计回答的是"这里有多少件事"，父任务本身就是一件事。
 */
export function PlanStatsPanel({ tasks }: { tasks: PlanNode[] }) {
  const stats = computePlanStats(tasks);
  const percent = Math.round(stats.completionRate * 100);

  return (
    <div className="plan-stats">
      <div className="plan-stat-cards">
        <StatCard label="总任务" value={String(stats.total)} />
        <StatCard label="已完成" value={String(stats.done)} />
        <StatCard label="完成率" value={`${percent}%`} />
        <StatCard label="逾期" value={String(stats.overdue)} tone={stats.overdue > 0 ? 'warn' : undefined} />
        <StatCard label={`最近 ${RECENT_DONE_DAYS} 天完成`} value={String(stats.recentDone)} />
      </div>

      <div className="plan-progress-bar" aria-label={`完成进度 ${percent}%`}>
        <div className="plan-progress-fill" style={{ width: `${percent}%` }} />
      </div>

      <h3 className="plan-stats-title">未完成任务的优先级分布</h3>
      <ul className="plan-priority-list">
        {PRIORITY_ROWS.map((row) => {
          const unfinished = stats.total - stats.done;
          const count = stats.byPriority[row.key];
          const share = unfinished === 0 ? 0 : Math.round((count / unfinished) * 100);
          return (
            <li key={row.key}>
              <span className="plan-priority-label">{row.label}</span>
              <span className="plan-priority-bar">
                <span style={{ width: `${share}%` }} />
              </span>
              <span className="plan-priority-count muted">{count}</span>
            </li>
          );
        })}
      </ul>

      {stats.total === 0 && <p className="muted plan-empty-hint">这个范围还没有任务。</p>}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warn';
}) {
  return (
    <div className={`plan-stat-card ${tone === 'warn' ? 'is-warn' : ''}`}>
      <span className="plan-stat-value">{value}</span>
      <span className="plan-stat-label muted">{label}</span>
    </div>
  );
}
