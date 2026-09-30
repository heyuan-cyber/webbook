import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NotifyItem, NotifyRepeat } from '@webbook/shared';
import {
  NOTIFY_REPEAT_LABELS,
  NOTIFY_REPEATS,
  compareNotifyItems,
  isDeliverable,
  isMissed,
} from '@webbook/shared';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { useNativeHostStore } from '@/store/useNativeHostStore';
import { checkAlarmPermissions } from '@/lib/nativeBridge';
import { syncReminders } from '@/lib/deviceSync';
import { toast } from '@/store/useToastStore';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';

/** `<input type="datetime-local">` 需要本地无时区的 `YYYY-MM-DDTHH:mm` */
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 本地输入值 → 绝对时刻 ISO */
function fromLocalInput(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function fmtWhen(iso?: string): string {
  if (!iso) return '不定时';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return `今天 ${time}`;
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${time}`;
}

/** 默认触发时刻：下一个整点 */
function nextHourInput(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d);
}

export function NotifyPage() {
  const { session } = useAuth();
  const token = session?.token;
  const caps = useNativeHostStore((s) => s.caps);
  const probed = useNativeHostStore((s) => s.probed);

  const [items, setItems] = useState<NotifyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 新建表单
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueInput, setDueInput] = useState(nextHourInput);
  const [repeat, setRepeat] = useState<NotifyRepeat>('none');
  const [creating, setCreating] = useState(false);

  /** 已过期且从未送达的条目——列表呈现，但不补发通知 */
  const [dismissedMissed, setDismissedMissed] = useState<Set<string>>(new Set());

  /**
   * 通知展示权限被拒的状态。
   *
   * **这一项不是可选的**：Phase 0 真机（小米 23049RAD8C）已证实——
   * 通知展示权限被拒时，闹钟照常触发、AlarmReceiver 照常执行，但
   * `nm.notify()` 抛 SecurityException，**用户什么都看不到**。
   * 排程成功、触发成功、结果为零。若不告诉用户，功能会表现为彻底失效。
   */
  const [notifyBlocked, setNotifyBlocked] = useState(false);
  const [exactBlocked, setExactBlocked] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.loadNotify(token);
      setItems(res.items);
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 启动时查一次闹钟相关权限——被判否时页面必须显式提示后果 */
  useEffect(() => {
    if (!caps.reminders) return;
    void checkAlarmPermissions().then((p) => {
      if (!p) return;
      setNotifyBlocked(p.canPostNotifications === false);
      setExactBlocked(p.canScheduleExactAlarms === false);
    });
  }, [caps.reminders]);

  const missed = useMemo(
    () => items.filter((i) => isMissed(i) && !dismissedMissed.has(i.id)),
    [items, dismissedMissed],
  );

  const sorted = useMemo(() => [...items].sort(compareNotifyItems), [items]);

  /**
   * 同步排程到手机。
   *
   * **语义是"提交即重建"**：必须提交完整窗口内容。这里取云端 `/due` 的展开结果
   * （重复规则已在服务端展开为具体实例），而不是列表里的 `dueAt`——
   * 否则重复提醒会被退化成单次。
   */
  const syncAlarms = useCallback(async () => {
    if (!token || !caps.reminders) return;
    try {
      // syncReminders 一次做完三件事：回写送达 → 拉取待触发 → 重建本地排程。
      // 顺序在 deviceSync 里有说明，不能调换。
      const res = await syncReminders(token);

      // 顺手刷新权限提示，避免用户看到过期的警告
      setNotifyBlocked(res.notifyBlocked);
      const perm = await checkAlarmPermissions();
      if (perm?.canScheduleExactAlarms !== undefined) {
        setExactBlocked(perm.canScheduleExactAlarms === false);
      }

      if (res.scheduled === null) {
        toast('error', `同步失败：${res.error ?? '未知错误'}`);
        return;
      }

      const parts: string[] = [`已排入 ${res.scheduled} 个`];
      if (res.delivered > 0) parts.push(`回写送达 ${res.delivered} 条`);
      if (res.missed > 0) parts.push(`${res.missed} 条已错过`);

      if (res.notifyBlocked) {
        // 排程成功但收不到——必须说清楚，否则用户会以为提醒坏了
        toast('info', `${parts.join(' · ')}，但通知展示权限被拒，到点你不会看到通知`);
      } else {
        toast('success', parts.join(' · '));
      }

      // 送达回写改变了云端状态，重拉一次列表让状态徽标跟上
      if (res.delivered > 0) await load();
    } catch (e) {
      // 同步失败不该阻断界面操作；用户可再次点击同步
      toast('error', `同步到手机失败：${(e as Error).message}`);
    }
  }, [token, caps.reminders, load]);

  const create = useCallback(async () => {
    if (!token || !title.trim()) return;
    setCreating(true);
    try {
      await apiClient.createNotify(token, {
        title: title.trim(),
        ...(body.trim() ? { body: body.trim() } : {}),
        ...(fromLocalInput(dueInput) ? { dueAt: fromLocalInput(dueInput)! } : {}),
        repeat,
      });
      setTitle('');
      setBody('');
      setDueInput(nextHourInput());
      setRepeat('none');
      await load();
      await syncAlarms();
    } catch (e) {
      toast('error', `创建失败：${(e as Error).message}`);
    } finally {
      setCreating(false);
    }
  }, [token, title, body, dueInput, repeat, load, syncAlarms]);

  const toggleDone = useCallback(
    async (item: NotifyItem) => {
      if (!token) return;
      setBusyId(item.id);
      try {
        await apiClient.patchNotify(token, item.id, { done: !item.done });
        await load();
        await syncAlarms();
      } catch (e) {
        toast('error', `更新失败：${(e as Error).message}`);
      } finally {
        setBusyId(null);
      }
    },
    [token, load, syncAlarms],
  );

  const remove = useCallback(
    async (item: NotifyItem) => {
      if (!token) return;
      setBusyId(item.id);
      const prev = items;
      setItems((list) => list.filter((i) => i.id !== item.id));
      try {
        await apiClient.deleteNotify(token, item.id);
        // 云端删除后本地排程也要收敛——否则手机还会在旧时刻响
        await syncAlarms();
      } catch (e) {
        setItems(prev);
        toast('error', `删除失败：${(e as Error).message}`);
      } finally {
        setBusyId(null);
      }
    },
    [token, items, syncAlarms],
  );

  if (!probed) {
    return (
      <div className="page">
        <Skeleton className="skeleton-block" style={{ height: 220 }} />
      </div>
    );
  }

  return (
    <div className="page notify-page">
      <header className="page-head">
        <h1>提醒</h1>
        <p className="muted">到点由手机弹通知，离线也能响</p>
      </header>

      {!caps.reminders && (
        <div className="perm-guide">
          <Icon name="info" size={20} />
          <div>
            <h3>需在手机 App 中使用</h3>
            <p className="muted">
              提醒可以在这里创建与修改，但只有装到手机上的 WebBook 才能真正弹出通知。
              网页端仍可管理内容。
            </p>
          </div>
        </div>
      )}

      {caps.reminders && notifyBlocked && (
        <div className="perm-guide" style={{ color: 'var(--danger)' }}>
          <Icon name="alert" size={20} />
          <div>
            <h3>提醒会响，但你收不到</h3>
            <p className="muted">
              系统的「通知展示权限」被拒绝。提醒仍会被排程、到点也会触发，
              但<strong>不会显示任何通知</strong>——看起来就像功能坏了。
              请到「设置 → 应用 → WebBook → 通知」里允许通知。
            </p>
          </div>
        </div>
      )}

      {caps.reminders && exactBlocked && (
        <div className="perm-guide" style={{ color: 'var(--warn)' }}>
          <Icon name="info" size={20} />
          <div>
            <h3>精确闹钟权限未授予</h3>
            <p className="muted">
              提醒仍会排程，但可能被系统省电策略延迟数分钟。
              如需准时，请到「设置 → 应用 → WebBook → 闹钟和提醒」里允许。
            </p>
          </div>
        </div>
      )}

      {caps.reminders && (
        <button type="button" className="notify-sync" onClick={() => void syncAlarms()}>
          <Icon name="clock" size={14} /> 同步到手机
        </button>
      )}

      {/* 新建 */}
      <section className="notify-create">
        <input
          type="text"
          placeholder="提醒什么？例如：交房租"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && title.trim()) void create();
          }}
        />
        <input
          type="text"
          placeholder="备注（可选）"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="notify-create-row">
          <input
            type="datetime-local"
            value={dueInput}
            onChange={(e) => setDueInput(e.target.value)}
          />
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as NotifyRepeat)}>
            {NOTIFY_REPEATS.map((r) => (
              <option key={r} value={r}>
                {NOTIFY_REPEAT_LABELS[r]}
              </option>
            ))}
          </select>
          <button type="button" disabled={creating || !title.trim()} onClick={() => void create()}>
            添加
          </button>
        </div>
      </section>

      {/* 错过：不补发通知，但要能被看见 */}
      {missed.length > 0 && (
        <section className="notify-missed">
          <h2>
            <Icon name="alert" size={14} /> 已错过的提醒（{missed.length}）
          </h2>
          <p className="muted">
            这些时刻已经过去且没有送达。为避免打扰，<strong>不会补发通知</strong>
            ——请自行处理或改期。
          </p>
          <ul>
            {missed.map((m) => (
              <li key={m.id}>
                <span>{m.title}</span>
                <span className="muted">{fmtWhen(m.dueAt)}</span>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setDismissedMissed((s) => new Set(s).add(m.id))}
                >
                  知道了
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading ? (
        <Skeleton className="skeleton-block" style={{ height: 180 }} />
      ) : error ? (
        <EmptyState icon="alert" title="读取失败" body={error} />
      ) : sorted.length === 0 ? (
        <EmptyState icon="clock" title="还没有提醒" body="在上面输入内容并选好时间即可添加。" />
      ) : (
        <ul className="notify-list">
          {sorted.map((item) => {
            const deliverable = isDeliverable(item);
            const delivered = !!item.notifiedAt;
            const overdue = deliverable && !delivered && isMissed(item);
            return (
              <li
                key={item.id}
                className={[
                  'notify-item',
                  item.done ? 'done' : '',
                  busyId === item.id ? 'busy' : '',
                  overdue ? 'overdue' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <button
                  type="button"
                  className="notify-check"
                  onClick={() => void toggleDone(item)}
                  aria-label={item.done ? '标记未完成' : '标记完成'}
                >
                  <Icon name={item.done ? 'check-square' : 'square'} size={16} />
                </button>
                <div className="notify-main">
                  <span className="notify-title">{item.title}</span>
                  {item.body && <span className="notify-body muted">{item.body}</span>}
                  <span className="notify-when muted">
                    {fmtWhen(item.dueAt)}
                    {item.repeat !== 'none' && ` · ${NOTIFY_REPEAT_LABELS[item.repeat]}`}
                    {/* 区分"已排程"与"已送达"——这是 spec 明确要求的状态区分 */}
                    {deliverable && (
                      <span className={`notify-state ${delivered ? 'delivered' : 'scheduled'}`}>
                        {delivered ? '已送达' : overdue ? '已错过' : '已排程'}
                      </span>
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  className="ghost danger"
                  onClick={() => void remove(item)}
                  aria-label="删除"
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
