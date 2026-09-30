import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UsageDay } from '@webbook/shared';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { useNativeHostStore } from '@/store/useNativeHostStore';
import { requestUsagePermission } from '@/lib/nativeBridge';
import { captureAndUploadUsage, type CaptureResult } from '@/lib/deviceSync';
import { toast } from '@/store/useToastStore';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';

/** 毫秒 → 人读的时长 */
function fmtDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} 分钟`;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分`;
}

function fmtPct(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/** 自然日字符串（本地时区），用于默认日期 */
function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** 把日期串偏移若干天 */
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

type RangeDays = 7 | 14 | 30;

export function UsagePage() {
  const { session } = useAuth();
  const token = session?.token;
  const caps = useNativeHostStore((s) => s.caps);
  const probed = useNativeHostStore((s) => s.probed);

  // 默认展示"最近一个已完成的自然日"，即昨天
  const [date, setDate] = useState(() => localDate(-1));
  const [day, setDay] = useState<UsageDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [range, setRange] = useState<RangeDays>(7);
  const [trend, setTrend] = useState<UsageDay[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  /** 最近一次采集的取数路径——用来观察 ROM 到底走通了哪条 */
  const [lastSync, setLastSync] = useState<CaptureResult | null>(null);

  const load = useCallback(
    async (target: string) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.loadUsageDay(token, target);
        setDay(res.day);
      } catch (e) {
        setError((e as Error).message);
        setDay(null);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  const loadDates = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiClient.loadUsageDates(token);
      setAvailableDates(res.dates);
    } catch {
      // 日期列表失败不影响单日查看，静默即可
    }
  }, [token]);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  /**
   * 采集并上报。
   *
   * 之所以放在界面上手动触发，而不是等周期任务：本轮还没有 WorkManager 编排
   * （tasks 6.12），手动触发是唯一能让"queryUsageStats 到底行不行"这个问题
   * 得到答案的途径。它也是验证采集链路端到端是否通的最短路径。
   */
  const runSync = useCallback(
    async (days: number) => {
      if (!token) return;
      setSyncing(true);
      try {
        const res = await captureAndUploadUsage(token, days);
        setLastSync(res);
        if (res.uploaded.length === 0) {
          toast('error', `没有采集到数据（${res.empty.length} 天为空）——请确认已授予使用情况访问权限`);
        } else {
          toast(
            'success',
            `已上报 ${res.uploaded.length} 天（取数：${res.source ?? '未知'}）`,
          );
        }
        await load(date);
        await loadDates();
      } catch (e) {
        toast('error', `采集失败：${(e as Error).message}`);
      } finally {
        setSyncing(false);
      }
    },
    [token, date, load, loadDates],
  );

  useEffect(() => {
    void loadDates();
  }, [loadDates]);

  // 趋势：只在用户切换跨度时拉取
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const to = localDate(-1);
    const from = shiftDate(to, -(range - 1));
    apiClient
      .loadUsageRange(token, from, to)
      .then((res) => {
        if (!cancelled) setTrend(res.days);
      })
      .catch(() => {
        if (!cancelled) setTrend([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, range]);

  const total = day?.totalMs ?? 0;
  const topApp = day?.apps[0];

  const trendMax = useMemo(
    () => Math.max(1, ...(trend ?? []).map((d) => d.totalMs)),
    [trend],
  );

  // 趋势里缺失的日期要留下空缺，而不是当作零值——否则曲线会被"没采集"拉平
  const trendSlots = useMemo(() => {
    const to = localDate(-1);
    const out: { date: string; day: UsageDay | null }[] = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = shiftDate(to, -i);
      out.push({ date: d, day: (trend ?? []).find((t) => t.date === d) ?? null });
    }
    return out;
  }, [trend, range]);

  if (!probed) {
    return (
      <div className="page">
        <Skeleton className="skeleton-block" style={{ height: 220 }} />
      </div>
    );
  }

  return (
    <div className="page usage-page">
      <header className="page-head">
        <h1>使用统计</h1>
        <p className="muted">每天用了多久、用在哪些应用上</p>
      </header>

      {!caps.usage && <PermissionGuide onRetry={() => useNativeHostStore.getState().probe()} />}

      {caps.usage && (
        <>
          <div className="usage-toolbar">
            <label className="usage-date">
              <span className="muted">日期</span>
              <input
                type="date"
                value={date}
                max={localDate(-1)}
                onChange={(e) => setDate(e.target.value || localDate(-1))}
              />
            </label>
            <div className="usage-quick">
              <button type="button" onClick={() => setDate(localDate(-1))}>
                昨天
              </button>
              <button type="button" onClick={() => setDate(localDate(-2))}>
                前天
              </button>
              <button type="button" disabled={syncing} onClick={() => void runSync(1)}>
                {syncing ? '采集中…' : '立即采集昨天'}
              </button>
              <button type="button" disabled={syncing} onClick={() => void runSync(7)}>
                补采 7 天
              </button>
            </div>
          </div>

          {lastSync && (
            <p className="usage-note">
              <Icon name="info" size={14} /> 取数路径：<strong>{lastSync.source ?? '未知'}</strong>
              {lastSync.fallbackUsed ? '（queryUsageStats 不可信，已自动回退）' : ''}
              {lastSync.uploaded.length ? ` · 已上报 ${lastSync.uploaded.length} 天` : ''}
              {lastSync.empty.length ? ` · ${lastSync.empty.length} 天无数据` : ''}
            </p>
          )}

          {loading ? (
            <Skeleton className="skeleton-block" style={{ height: 180 }} />
          ) : error ? (
            <EmptyState icon="alert" title="读取失败" body={error} />
          ) : !day ? (
            <EmptyState
              icon="clock"
              title="这一天没有数据"
              body={
                availableDates.length
                  ? `已采集的日期：${availableDates.slice(-5).join('、')}`
                  : '还没有采集到任何使用数据。请确认已在手机上授予「使用情况访问权限」。'
              }
            />
          ) : (
            <>
              <div className="usage-summary">
                <div className="usage-total">
                  <span className="muted">当日总计</span>
                  <strong>{fmtDuration(total)}</strong>
                </div>
                {topApp && (
                  <div className="usage-total">
                    <span className="muted">用得最多</span>
                    <strong>
                      {topApp.label} · {fmtDuration(topApp.ms)}
                    </strong>
                  </div>
                )}
              </div>

              {day.truncated && (
                <p className="usage-note">
                  <Icon name="info" size={14} /> 该日应用过多，尾部应用已合并为「其他」；总时长不受影响。
                </p>
              )}

              <ul className="usage-list">
                {day.apps.map((app) => {
                  const share = total > 0 ? app.ms / total : 0;
                  return (
                    <li key={app.pkg} className="usage-row">
                      <div className="usage-row-main">
                        <span className="usage-label" title={app.pkg}>
                          {app.label}
                        </span>
                        <span className="usage-ms">{fmtDuration(app.ms)}</span>
                      </div>
                      <div className="usage-bar">
                        <span style={{ width: `${Math.max(share * 100, 0.5)}%` }} />
                      </div>
                      <div className="usage-row-sub muted">
                        <span>{fmtPct(share)}</span>
                        <span>{app.launches} 次</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <section className="usage-trend">
            <div className="usage-trend-head">
              <h2>趋势</h2>
              <div className="usage-quick">
                {([7, 14, 30] as RangeDays[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={range === r ? 'active' : ''}
                    onClick={() => setRange(r)}
                  >
                    {r} 天
                  </button>
                ))}
              </div>
            </div>
            <div className="usage-bars">
              {trendSlots.map(({ date: d, day: t }) => (
                <div key={d} className="usage-bar-col" title={`${d}：${t ? fmtDuration(t.totalMs) : '无数据'}`}>
                  {t ? (
                    <span style={{ height: `${Math.max((t.totalMs / trendMax) * 100, 2)}%` }} />
                  ) : (
                    // 无数据的日期保留空槽位，明确区分"没采集"与"零使用"
                    <span className="usage-bar-missing" />
                  )}
                </div>
              ))}
            </div>
            <p className="muted usage-trend-foot">
              空心柱表示该日没有采集数据（不是"当天没用手机"）
            </p>
          </section>
        </>
      )}
    </div>
  );
}

/** 权限缺失时的引导：说明用途后跳系统设置 */
function PermissionGuide({ onRetry }: { onRetry: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="perm-guide">
      <Icon name="info" size={20} />
      <div>
        <h3>需要「使用情况访问权限」</h3>
        <p className="muted">
          这个权限让 WebBook 读取各应用的前台使用时长，用于生成统计。
          数据只上传到你自己的私有数据仓，不经过任何第三方。
        </p>
        <div className="perm-actions">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await requestUsagePermission();
              toast('info', '请在系统设置中授予权限，然后回到这里重新检测');
              setTimeout(() => {
                onRetry();
                setBusy(false);
              }, 1500);
            }}
          >
            前往系统设置
          </button>
          <button type="button" className="ghost" onClick={onRetry}>
            重新检测
          </button>
        </div>
      </div>
    </div>
  );
}
