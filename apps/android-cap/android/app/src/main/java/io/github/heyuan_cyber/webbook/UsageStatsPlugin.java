package io.github.heyuan_cyber.webbook;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 使用统计桥（tasks 6.7 / 6.8）。
 *
 * ## 只返回原始数据，不聚合上限
 *
 * 上限合并（超出部分归入"其他"）刻意放在 **Web 层**（`capUsageApps` in
 * `packages/shared/usage.ts`）：那个函数在 Worker 与断言脚本里跑同一份实现，
 * 放在原生会导致三处口径可能不一致。本插件只负责把该日事实取回来。
 *
 * ## 自适应取数：为什么两条路都实现
 *
 * `queryUsageStats` 是官方推荐路径，但在部分国产 ROM 上会返回空或失真的日桶。
 * `queryEvents` 拿原始事件流自行配对聚合，更可靠但事件量大、耗电更高。
 *
 * 探针阶段没能在目标机上确认哪条可用（只验到权限已授予），因此这里**不赌**：
 * 先走 `queryUsageStats`，结果不可信（应用数为 0 或总时长为 0）时自动回退
 * `queryEvents`，并在返回里注明实际用了哪条路。
 *
 * **判定"可信"的标准是"有没有拿到有时长的应用"**，而不是"调用有没有抛异常"——
 * ROM 限制的表现是不报错但返回空，异常反而是少见的好情况。
 */
@CapacitorPlugin(name = "UsageStats")
public class UsageStatsPlugin extends Plugin {

    private static final String TAG = "WebBookUsage";

    /** 低于这个应用数就认为 queryUsageStats 不可信，回退事件流 */
    private static final int MIN_TRUSTED_APPS = 1;

    /* ══════════════════ 主入口 ══════════════════ */

    @PluginMethod
    public void daily(PluginCall call) {
        JSObject ret = new JSObject();
        String date = call.getString("date", yesterdayLocal());
        ret.put("date", date);

        if (!hasPermissionInternal()) {
            ret.put("granted", false);
            ret.put("error", "未授予「使用情况访问权限」");
            call.resolve(ret);
            return;
        }
        ret.put("granted", true);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            ret.put("error", "API < 21，无 UsageStatsManager");
            call.resolve(ret);
            return;
        }

        long[] range = localDayRange(date);
        try {
            List<Row> stats = queryByStats(range[0], range[1]);
            boolean statsTrusted = stats.size() >= MIN_TRUSTED_APPS;

            List<Row> events = null;
            if (!statsTrusted) {
                Log.i(TAG, "queryUsageStats 返回 " + stats.size() + " 个应用，回退 queryEvents");
                events = queryByEvents(range[0], range[1]);
            }

            List<Row> chosen = statsTrusted ? stats : events;
            if (chosen == null) chosen = new ArrayList<>();

            ret.put("source", statsTrusted ? "queryUsageStats" : "queryEvents");
            ret.put("fallbackUsed", !statsTrusted);
            ret.put("statsAppCount", stats.size());
            if (events != null) ret.put("eventsAppCount", events.size());
            ret.put("apps", toJsArray(chosen));
            ret.put("appCount", chosen.size());
            ret.put("totalMs", totalOf(chosen));
        } catch (Exception e) {
            ret.put("error", String.valueOf(e.getMessage()));
            Log.w(TAG, "daily failed", e);
        }
        call.resolve(ret);
    }

    /* ══════════════════ 权限 ══════════════════ */

    @PluginMethod
    public void hasPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasPermissionInternal());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            Intent i = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            ret.put("opened", true);
        } catch (Exception e) {
            try {
                Intent fb = new Intent(Settings.ACTION_SETTINGS);
                fb.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fb);
                ret.put("opened", true);
                ret.put("fallback", true);
            } catch (Exception e2) {
                ret.put("opened", false);
                ret.put("error", String.valueOf(e2.getMessage()));
            }
        }
        call.resolve(ret);
    }

    /**
     * PACKAGE_USAGE_STATS 是特殊权限（AppOps），不是运行时权限。
     * `unsafeCheckOpNoThrow` 在 Q+ 才存在，低版本要用 `checkOpNoThrow`。
     */
    private boolean hasPermissionInternal() {
        try {
            AppOpsManager ops =
                    (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
            if (ops == null) return false;
            int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                            Process.myUid(), getContext().getPackageName())
                    : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                            Process.myUid(), getContext().getPackageName());
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) {
            Log.w(TAG, "hasPermission check failed: " + e.getMessage());
            return false;
        }
    }

    /* ══════════════════ 路径 A：queryUsageStats ══════════════════ */

    private List<Row> queryByStats(long start, long end) {
        UsageStatsManager usm = (UsageStatsManager)
                getContext().getSystemService(Context.USAGE_STATS_SERVICE);
        List<Row> out = new ArrayList<>();
        if (usm == null) return out;

        List<UsageStats> stats = usm.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY, start, end);
        if (stats == null || stats.isEmpty()) return out;

        // 同一包名可能有多个桶（跨天边界），必须合并，否则会重复计
        Map<String, long[]> agg = new HashMap<>();
        for (UsageStats s : stats) {
            if (s == null || s.getPackageName() == null) continue;
            long[] cur = agg.get(s.getPackageName());
            if (cur == null) agg.put(s.getPackageName(), new long[]{s.getTotalTimeInForeground(), 0L});
            else cur[0] += s.getTotalTimeInForeground();
        }
        for (Map.Entry<String, long[]> e : agg.entrySet()) {
            if (e.getValue()[0] <= 0) continue;
            out.add(new Row(e.getKey(), labelOf(e.getKey()), e.getValue()[0], 0L));
        }
        sortDesc(out);
        return out;
    }

    /* ══════════════════ 路径 B：queryEvents ══════════════════ */

    /**
     * 把前台会话事件配对成时长。
     *
     * RESUMED/PAUSED 成对出现；关机或强杀可能留下未闭合的 RESUMED，
     * 这类会话按**窗口末尾**兜底（而不是丢弃），否则最后使用的应用会凭空消失。
     */
    private List<Row> queryByEvents(long start, long end) {
        UsageStatsManager usm = (UsageStatsManager)
                getContext().getSystemService(Context.USAGE_STATS_SERVICE);
        List<Row> out = new ArrayList<>();
        if (usm == null) return out;

        UsageEvents events = usm.queryEvents(start, end);
        if (events == null) return out;

        Map<String, Long> fgStart = new HashMap<>();
        Map<String, long[]> agg = new HashMap<>(); // pkg -> {ms, launches}

        UsageEvents.Event ev = new UsageEvents.Event();
        while (events.getNextEvent(ev)) {
            String pkg = ev.getPackageName();
            if (pkg == null) continue;
            int type = ev.getEventType();

            boolean resumed = type == UsageEvents.Event.ACTIVITY_RESUMED
                    || type == UsageEvents.Event.MOVE_TO_FOREGROUND;
            boolean paused = type == UsageEvents.Event.ACTIVITY_PAUSED
                    || type == UsageEvents.Event.MOVE_TO_BACKGROUND;

            if (resumed) {
                fgStart.put(pkg, ev.getTimeStamp());
                long[] cur = agg.get(pkg);
                if (cur == null) agg.put(pkg, new long[]{0L, 1L});
                else cur[1] += 1;
            } else if (paused) {
                Long st = fgStart.remove(pkg);
                if (st != null) {
                    long dur = Math.max(0, ev.getTimeStamp() - st);
                    long[] cur = agg.get(pkg);
                    if (cur == null) agg.put(pkg, new long[]{dur, 0L});
                    else cur[0] += dur;
                }
            }
        }

        // 未闭合的会话：按窗口末尾兜底
        for (Map.Entry<String, Long> e : fgStart.entrySet()) {
            long dur = Math.max(0, end - e.getValue());
            long[] cur = agg.get(e.getKey());
            if (cur == null) agg.put(e.getKey(), new long[]{dur, 0L});
            else cur[0] += dur;
        }

        for (Map.Entry<String, long[]> e : agg.entrySet()) {
            if (e.getValue()[0] <= 0) continue;
            out.add(new Row(e.getKey(), labelOf(e.getKey()), e.getValue()[0], e.getValue()[1]));
        }
        sortDesc(out);
        return out;
    }

    /* ══════════════════ 工具 ══════════════════ */

    private static final class Row {
        final String pkg;
        final String label;
        final long ms;
        final long launches;

        Row(String pkg, String label, long ms, long launches) {
            this.pkg = pkg;
            this.label = label;
            this.ms = ms;
            this.launches = launches;
        }
    }

    private void sortDesc(List<Row> rows) {
        Collections.sort(rows, new Comparator<Row>() {
            @Override
            public int compare(Row a, Row b) {
                return Long.compare(b.ms, a.ms);
            }
        });
    }

    private JSArray toJsArray(List<Row> rows) {
        JSArray arr = new JSArray();
        for (Row r : rows) {
            JSObject o = new JSObject();
            o.put("pkg", r.pkg);
            o.put("label", r.label);
            o.put("ms", r.ms);
            o.put("launches", r.launches);
            arr.put(o);
        }
        return arr;
    }

    private long totalOf(List<Row> rows) {
        long t = 0;
        for (Row r : rows) t += r.ms;
        return t;
    }

    private String labelOf(String pkg) {
        try {
            PackageManager pm = getContext().getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
            return String.valueOf(pm.getApplicationLabel(info));
        } catch (Exception e) {
            return pkg;
        }
    }

    /** 本地时区某自然日的 [start, end)。end 额外放宽一天：部分 ROM 的日桶会滞后 */
    private long[] localDayRange(String date) {
        String[] p = date.split("-");
        Calendar c = Calendar.getInstance();
        c.clear();
        try {
            c.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]), 0, 0, 0);
        } catch (Exception e) {
            c.setTime(new Date());
            c.set(Calendar.HOUR_OF_DAY, 0);
            c.set(Calendar.MINUTE, 0);
            c.set(Calendar.SECOND, 0);
        }
        long start = c.getTimeInMillis();
        return new long[]{start, start + 2L * 24 * 60 * 60 * 1000};
    }

    private String yesterdayLocal() {
        Calendar c = Calendar.getInstance();
        c.add(Calendar.DAY_OF_YEAR, -1);
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(c.getTime());
    }
}
