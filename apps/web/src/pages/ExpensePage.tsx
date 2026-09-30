import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Expense, ExpenseCategory, ExpenseSummary } from '@webbook/shared';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from '@webbook/shared';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { useNativeHostStore } from '@/store/useNativeHostStore';
import { requestPayPermission } from '@/lib/nativeBridge';
import { captureAndUploadExpenses, type ExpenseCaptureResult } from '@/lib/deviceSync';
import { toast } from '@/store/useToastStore';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';

function fmtYuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

/** 当前月份 `YYYY-MM`；offset 为月份偏移 */
function localMonth(offset = 0): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${y} 年 ${Number(m)} 月`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(
    d.getHours(),
  ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 类别配色：按索引取固定色相，避免引额外的调色板依赖 */
function categoryColor(category: ExpenseCategory): string {
  const i = EXPENSE_CATEGORIES.indexOf(category);
  return `hsl(${(i * 37) % 360} 62% 52%)`;
}

export function ExpensePage() {
  const { session } = useAuth();
  const token = session?.token;
  const caps = useNativeHostStore((s) => s.caps);
  const probed = useNativeHostStore((s) => s.probed);

  const [month, setMonth] = useState(() => localMonth());
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showUncategorizedOnly, setShowUncategorizedOnly] = useState(false);
  const [capturing, setCapturing] = useState(false);
  /** 最近一次采集的统计，用于暴露"有多少条没被识别" */
  const [lastCapture, setLastCapture] = useState<ExpenseCaptureResult | null>(null);

  const load = useCallback(
    async (target: string) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.loadExpenseOverview(token, target);
        setSummary(res.summary);
        setExpenses(res.expenses);
      } catch (e) {
        setError((e as Error).message);
        setSummary(null);
        setExpenses([]);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void load(month);
  }, [month, load]);

  const uncategorized = useMemo(
    () => expenses.filter((e) => e.category === 'uncategorized'),
    [expenses],
  );

  const visible = useMemo(
    () => (showUncategorizedOnly ? uncategorized : expenses),
    [showUncategorizedOnly, uncategorized, expenses],
  );

  /**
   * 取走通知 → 解析 → 攒批上报。
   *
   * 定义在 `load` 之后（它依赖 load 刷新列表）。本阶段的周期任务（tasks 6.12）
   * 还没接，因此这是唯一的采集入口。`force` 让用户能绕过攒批阈值立即上报——
   * 否则只发生一两笔支付时永远等不到阈值。
   */
  const runCapture = useCallback(
    async (force: boolean) => {
      if (!token) return;
      setCapturing(true);
      try {
        const res = await captureAndUploadExpenses(token, { force });
        setLastCapture(res);
        if (!res.submitted) {
          toast('info', '已解析但未达上报阈值（攒够 5 条，或点「立即上报」）');
        } else if (res.added + res.merged === 0) {
          toast('info', '没有新的消费记录');
        } else {
          const parts = [`新增 ${res.added} 条`];
          if (res.merged > 0) parts.push(`合并 ${res.merged} 条`);
          if (res.classifiedByAi > 0) parts.push(`AI 归类 ${res.classifiedByAi} 条`);
          if (res.unclassified > 0) parts.push(`未分类 ${res.unclassified} 条`);
          toast('success', parts.join(' · '));
        }
        await load(month);
      } catch (e) {
        toast('error', `采集失败：${(e as Error).message}`);
      } finally {
        setCapturing(false);
      }
    },
    [token, month, load],
  );

  /** 改类别：本地先动，失败回滚——避免改一次要等一个来回 */
  const changeCategory = useCallback(
    async (expense: Expense, category: ExpenseCategory) => {
      if (!token) return;
      const prev = expenses;
      setBusyId(expense.id);
      setExpenses((list) =>
        list.map((e) => (e.id === expense.id ? { ...e, category, categoryPinned: true } : e)),
      );
      try {
        await apiClient.setExpenseCategory(token, expense.id, category);
        // 服务端同时把「商户 → 类别」沉淀成规则，因此需要重拉汇总
        await load(month);
        toast('success', `已归类为「${EXPENSE_CATEGORY_LABELS[category]}」，该商户后续会自动沿用`);
      } catch (e) {
        setExpenses(prev);
        toast('error', `归类失败：${(e as Error).message}`);
      } finally {
        setBusyId(null);
      }
    },
    [token, expenses, load, month],
  );

  const remove = useCallback(
    async (expense: Expense) => {
      if (!token) return;
      const prev = expenses;
      setBusyId(expense.id);
      setExpenses((list) => list.filter((e) => e.id !== expense.id));
      try {
        await apiClient.deleteExpense(token, expense.id);
        await load(month);
        toast('success', '已删除该条记录');
      } catch (e) {
        setExpenses(prev);
        toast('error', `删除失败：${(e as Error).message}`);
      } finally {
        setBusyId(null);
      }
    },
    [token, expenses, load, month],
  );

  if (!probed) {
    return (
      <div className="page">
        <Skeleton className="skeleton-block" style={{ height: 220 }} />
      </div>
    );
  }

  return (
    <div className="page expense-page">
      <header className="page-head">
        <h1>账单</h1>
        <p className="muted">每月花了多少、钱花在哪几类上</p>
      </header>

      {!caps.payListener && <PermissionGuide onRetry={() => useNativeHostStore.getState().probe()} />}

      <div className="expense-toolbar">
        <button type="button" onClick={() => setMonth(localMonth(-1))} aria-label="上个月">
          <Icon name="chevron-left" size={16} />
        </button>
        <strong>{fmtMonthLabel(month)}</strong>
        <button
          type="button"
          onClick={() => setMonth(localMonth())}
          disabled={month === localMonth()}
          aria-label="回到本月"
        >
          本月
        </button>
      </div>

      {caps.payListener && (
        <div className="usage-toolbar">
          <div className="usage-quick">
            <button type="button" disabled={capturing} onClick={() => void runCapture(false)}>
              {capturing ? '采集中…' : '采集支付通知'}
            </button>
            <button type="button" disabled={capturing} onClick={() => void runCapture(true)}>
              立即上报
            </button>
          </div>
        </div>
      )}

      {lastCapture && (
        <p className="usage-note">
          <Icon name="info" size={14} /> 上次采集：新增 {lastCapture.added} · 合并{' '}
          {lastCapture.merged} · 未识别 {lastCapture.unparsed}
          {Object.keys(lastCapture.rejected).length > 0 &&
            ` · 已排除 ${Object.values(lastCapture.rejected).reduce((a, b) => a + b, 0)}`}
          {lastCapture.unclassified > 0 && ` · 未分类 ${lastCapture.unclassified}`}
        </p>
      )}

      {loading ? (
        <Skeleton className="skeleton-block" style={{ height: 220 }} />
      ) : error ? (
        <EmptyState icon="alert" title="读取失败" body={error} />
      ) : !summary || summary.count === 0 ? (
        <EmptyState
          icon="list-tree"
          title="这个月还没有记录"
          body={
            caps.payListener
              ? '用微信或支付宝支付后会自动记账，通常几分钟内出现。'
              : '自动记账需要在手机上授予「通知使用权」。'
          }
        />
      ) : (
        <>
          <div className="expense-total">
            <span className="muted">本月支出</span>
            <strong>{fmtYuan(summary.totalCents)}</strong>
            <span className="muted">{summary.count} 笔</span>
          </div>

          <div className="expense-stack" role="img" aria-label="类别占比">
            {summary.byCategory.map((c) => (
              <span
                key={c.category}
                style={{
                  width: `${c.share * 100}%`,
                  background: categoryColor(c.category),
                }}
                title={`${EXPENSE_CATEGORY_LABELS[c.category]} ${fmtYuan(c.amountCents)}`}
              />
            ))}
          </div>

          <ul className="expense-cats">
            {summary.byCategory.map((c) => (
              <li key={c.category}>
                <i style={{ background: categoryColor(c.category) }} />
                <span className="expense-cat-name">{EXPENSE_CATEGORY_LABELS[c.category]}</span>
                <span className="muted">{(c.share * 100).toFixed(1)}%</span>
                <span>{fmtYuan(c.amountCents)}</span>
              </li>
            ))}
          </ul>

          {uncategorized.length > 0 && (
            <button
              type="button"
              className={`expense-uncat-notice${showUncategorizedOnly ? ' active' : ''}`}
              onClick={() => setShowUncategorizedOnly((v) => !v)}
            >
              <Icon name="alert" size={14} />
              有 {uncategorized.length} 笔未分类，{showUncategorizedOnly ? '显示全部' : '逐条归类'}
            </button>
          )}

          <ul className="expense-list">
            {visible.map((e) => (
              <li key={e.id} className={busyId === e.id ? 'busy' : ''}>
                <div className="expense-row-main">
                  <span className="expense-merchant" title={e.merchant}>
                    {e.merchant || '（未知商户）'}
                  </span>
                  <strong>{fmtYuan(e.amountCents)}</strong>
                </div>
                <div className="expense-row-sub">
                  <span className="muted">
                    {fmtTime(e.postedAt)} · {e.source === 'wechat' ? '微信' : '支付宝'}
                  </span>
                  <span className="expense-actions">
                    <select
                      value={e.category}
                      disabled={busyId === e.id}
                      onChange={(ev) => void changeCategory(e, ev.target.value as ExpenseCategory)}
                      aria-label="修改类别"
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {EXPENSE_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ghost danger"
                      disabled={busyId === e.id}
                      onClick={() => void remove(e)}
                      aria-label="删除该记录"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** 权限缺失时的引导 */
function PermissionGuide({ onRetry }: { onRetry: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="perm-guide">
      <Icon name="info" size={20} />
      <div>
        <h3>需要「通知使用权」</h3>
        <p className="muted">
          WebBook 通过读取微信与支付宝的支付通知来自动记账。通知原文只在手机上解析，
          上传的只有金额、商户、时间与类别，原文不会离开设备。
        </p>
        <div className="perm-actions">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await requestPayPermission();
              toast('info', '请在系统设置中开启通知使用权，然后回到这里重新检测');
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
