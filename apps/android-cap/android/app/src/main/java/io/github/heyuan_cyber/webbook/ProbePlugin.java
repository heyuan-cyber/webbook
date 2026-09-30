package io.github.heyuan_cyber.webbook;

import android.app.AlarmManager;
import android.app.AppOpsManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
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
import java.util.TimeZone;

/**
 * Phase 0 探针插件（native-android-companion 的 tasks 2.6 / 2.7 / 2.8）。
 *
 * 目的不是在实现功能，而是回答三个只有真机能答的问题：
 *
 *   2.6  `UsageStatsManager` 在目标 ROM 上能否稳定拿到 7 天数据？
 *        走 `queryUsageStats` 还是退到 `queryEvents` 自行聚合？
 *   2.7  `NotificationListenerService` 能否拿到微信/支付宝的支付通知？原文长什么样？
 *   2.8  精确闹钟在息屏/省电下到点能否弹出？普通精确闹钟与 `setAlarmClock` 差异如何？
 *
 * 因此每个方法都**如实报告事实与失败原因**，不做任何补偿或猜测——
 * 探针的价值在于暴露真相，而不是把真相包装成可用。
 *
 * 设计纪律（Phase 0 的教训）：每个方法都不抛异常，失败以 JSON 字段表达，
 * 让界面永远有东西可显示。
 */
@CapacitorPlugin(name = "Probe")
public class ProbePlugin extends Plugin {

    private static final String TAG = "WebBookProbe";

    /* ══════════════════ 汇总：一次拿到全部事实 ══════════════════ */

    @PluginMethod
    public void snapshot(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            ret.put("pluginReached", true);
            ret.put("nativeSdkInt", Build.VERSION.SDK_INT);
            ret.put("nativeRelease", Build.VERSION.RELEASE);
            ret.put("nativeDevice", Build.MANUFACTURER + " " + Build.MODEL);
            ret.put("timezone", TimeZone.getDefault().getID());
            ret.put("nowLocal", new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
                    .format(new Date()));

            ret.put("usageGranted", hasUsageAccess());
            ret.put("notifyListenerGranted", PayListenerService.isPermissionGranted(getContext()));
            ret.put("notifyListenerConnected", PayListenerService.isConnected());
            ret.put("notifyListenerDisconnects", PayListenerService.getDisconnectCount());
            ret.put("notificationsSeen", PayListenerService.getTotalSeen());
            ret.put("notificationsKept", PayListenerService.getTotalKept());
            ret.put("notificationsBuffered", PayListenerService.bufferedCount());

            ret.put("canPostNotifications", canPostNotifications());
            ret.put("canScheduleExactAlarms", canScheduleExactAlarms());
            ret.put("lastAlarmFired", AlarmReceiver.lastFiredSummary());

            JSArray listeners = new JSArray();
            for (String s : PayListenerService.grantedListeners(getContext())) listeners.put(s);
            ret.put("grantedListeners", listeners);
        } catch (Exception e) {
            ret.put("pluginReached", true);
            ret.put("snapshotError", String.valueOf(e.getMessage()));
        }
        call.resolve(ret);
    }

    /* ══════════════════ 权限检查与引导 ══════════════════ */

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("usageGranted", hasUsageAccess());
        ret.put("notifyListenerGranted", PayListenerService.isPermissionGranted(getContext()));
        ret.put("notifyListenerConnected", PayListenerService.isConnected());
        ret.put("canPostNotifications", canPostNotifications());
        ret.put("canScheduleExactAlarms", canScheduleExactAlarms());
        call.resolve(ret);
    }

    /** 打开系统设置页。各厂商路径不同，任一 Intent 抛异常都回退到应用详情页。 */
    @PluginMethod
    public void openSettings(PluginCall call) {
        String which = call.getString("which", "usage");
        JSObject ret = new JSObject();
        try {
            Intent intent;
            if ("notifyListener".equals(which)) {
                intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            } else if ("exactAlarm".equals(which)) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                    intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                } else {
                    intent = appDetailsIntent();
                }
            } else if ("appNotifications".equals(which)) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            } else {
                intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            ret.put("opened", which);
        } catch (Exception e) {
            try {
                Intent fallback = appDetailsIntent();
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                ret.put("opened", "appDetails(fallback)");
                ret.put("fallbackReason", String.valueOf(e.getMessage()));
            } catch (Exception e2) {
                ret.put("error", String.valueOf(e2.getMessage()));
            }
        }
        call.resolve(ret);
    }

    private Intent appDetailsIntent() {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        i.setData(Uri.parse("package:" + getContext().getPackageName()));
        return i;
    }

    /* ══════════════════ 2.6 使用统计 ══════════════════ */

    /**
     * 按自然日取各应用前台时长（走 `queryUsageStats`）。
     *
     * `date` 为本地时区的 `YYYY-MM-DD`。返回的 `boundaryNote` 会说明实际查询区间——
     * `queryUsageStats` 的第一个参数只是"起点"，返回的桶可能与请求日期不完全对齐，
     * 因此上层仍需按 bucket 自身的 `firstTimeStamp` 归属日期。
     */
    @PluginMethod
    public void usageDaily(PluginCall call) {
        JSObject ret = new JSObject();
        String date = call.getString("date", todayLocal());
        ret.put("date", date);

        if (!hasUsageAccess()) {
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

        try {
            long[] range = localDayRange(date);
            long start = range[0];
            long end = range[1];

            android.app.usage.UsageStatsManager usm =
                    (android.app.usage.UsageStatsManager)
                            getContext().getSystemService(Context.USAGE_STATS_SERVICE);

            List<android.app.usage.UsageStats> stats =
                    usm.queryUsageStats(
                            android.app.usage.UsageStatsManager.INTERVAL_DAILY, start, end);

            JSArray apps = new JSArray();
            long total = 0;
            int rawBuckets = stats == null ? 0 : stats.size();
            long minFirst = Long.MAX_VALUE;
            long maxLast = Long.MIN_VALUE;

            if (stats != null) {
                // 同一包名可能有多个桶（跨天边界），需合并
                Map<String, long[]> agg = new HashMap<>(); // pkg -> {ms, first, last}
                for (android.app.usage.UsageStats s : stats) {
                    if (s == null || s.getPackageName() == null) continue;
                    long[] cur = agg.get(s.getPackageName());
                    if (cur == null) {
                        agg.put(s.getPackageName(), new long[]{
                                s.getTotalTimeInForeground(), s.getFirstTimeStamp(), s.getLastTimeStamp()});
                    } else {
                        cur[0] += s.getTotalTimeInForeground();
                        cur[1] = Math.min(cur[1], s.getFirstTimeStamp());
                        cur[2] = Math.max(cur[2], s.getLastTimeStamp());
                    }
                }
                List<Map.Entry<String, long[]>> list = new ArrayList<>(agg.entrySet());
                Collections.sort(list, new Comparator<Map.Entry<String, long[]>>() {
                    @Override
                    public int compare(Map.Entry<String, long[]> a, Map.Entry<String, long[]> b) {
                        return Long.compare(b.getValue()[0], a.getValue()[0]);
                    }
                });
                int withTime = 0;
                for (Map.Entry<String, long[]> e : list) {
                    long ms = e.getValue()[0];
                    if (ms <= 0) continue;
                    withTime++;
                    total += ms;
                    minFirst = Math.min(minFirst, e.getValue()[1]);
                    maxLast = Math.max(maxLast, e.getValue()[2]);

                    JSObject a = new JSObject();
                    a.put("pkg", e.getKey());
                    a.put("label", labelOf(e.getKey()));
                    a.put("ms", ms);
                    a.put("launches", 0); // queryUsageStats 不提供启动次数
                    apps.put(a);
                }
                ret.put("appsWithTime", withTime);
            }

            SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);

            ret.put("apps", apps);
            ret.put("appCount", apps.length());
            ret.put("totalMs", total);
            ret.put("rawBucketCount", rawBuckets);
            ret.put("queryStart", iso.format(new Date(start)));
            ret.put("queryEnd", iso.format(new Date(end)));
            // 桶的实际跨度：若与请求日明显不符，说明 ROM 会自行对齐/裁剪
            ret.put("bucketFirst", minFirst == Long.MAX_VALUE ? "" : iso.format(new Date(minFirst)));
            ret.put("bucketLast", maxLast == Long.MIN_VALUE ? "" : iso.format(new Date(maxLast)));
        } catch (Exception e) {
            ret.put("error", String.valueOf(e.getMessage()));
            Log.w(TAG, "usageDaily failed", e);
        }
        call.resolve(ret);
    }

    /**
     * 按事件流取前台会话并按包聚合（走 `queryEvents`）。
     *
     * 与 `usageDaily` 的对照用途：若前者在目标 ROM 上返回空/失真的数据，
     * 这条路径能给出可自行聚合的原始事件。代价是事件量大、耗电更高。
     */
    @PluginMethod
    public void usageEvents(PluginCall call) {
        JSObject ret = new JSObject();
        String date = call.getString("date", todayLocal());
        ret.put("date", date);

        if (!hasUsageAccess()) {
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

        try {
            long[] range = localDayRange(date);
            android.app.usage.UsageStatsManager usm =
                    (android.app.usage.UsageStatsManager)
                            getContext().getSystemService(Context.USAGE_STATS_SERVICE);

            android.app.usage.UsageEvents events = usm.queryEvents(range[0], range[1]);
            if (events == null) {
                ret.put("error", "queryEvents 返回 null");
                call.resolve(ret);
                return;
            }

            // 把 ACTIVITY_RESUMED / ACTIVITY_PAUSED 配对成前台会话
            Map<String, Long> fgStart = new HashMap<>();
            Map<String, long[]> agg = new HashMap<>(); // pkg -> {ms, launches}
            List<String> eventTypeHistogram = new ArrayList<>();

            android.app.usage.UsageEvents.Event ev =
                    new android.app.usage.UsageEvents.Event();
            int scanned = 0;
            while (events.getNextEvent(ev)) {
                scanned++;
                String pkg = ev.getPackageName();
                if (pkg == null) continue;
                int type = ev.getEventType();

                boolean resumed = type == android.app.usage.UsageEvents.Event.ACTIVITY_RESUMED
                        || type == android.app.usage.UsageEvents.Event.MOVE_TO_FOREGROUND;
                boolean paused = type == android.app.usage.UsageEvents.Event.ACTIVITY_PAUSED
                        || type == android.app.usage.UsageEvents.Event.MOVE_TO_BACKGROUND;

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
                if (eventTypeHistogram.size() < 40) {
                    eventTypeHistogram.add(type + ":" + pkg);
                }
            }

            // 仍在后台之前没有 PAUSED 的会话：按区间末尾兜底
            for (Map.Entry<String, Long> e : fgStart.entrySet()) {
                long dur = Math.max(0, range[1] - e.getValue());
                long[] cur = agg.get(e.getKey());
                if (cur == null) agg.put(e.getKey(), new long[]{dur, 0L});
                else cur[0] += dur;
            }

            List<Map.Entry<String, long[]>> list = new ArrayList<>(agg.entrySet());
            Collections.sort(list, new Comparator<Map.Entry<String, long[]>>() {
                @Override
                public int compare(Map.Entry<String, long[]> a, Map.Entry<String, long[]> b) {
                    return Long.compare(b.getValue()[0], a.getValue()[0]);
                }
            });

            JSArray apps = new JSArray();
            long total = 0;
            for (Map.Entry<String, long[]> e : list) {
                if (e.getValue()[0] <= 0) continue;
                total += e.getValue()[0];
                JSObject a = new JSObject();
                a.put("pkg", e.getKey());
                a.put("label", labelOf(e.getKey()));
                a.put("ms", e.getValue()[0]);
                a.put("launches", e.getValue()[1]);
                apps.put(a);
            }

            JSArray hist = new JSArray();
            for (String h : eventTypeHistogram) hist.put(h);

            ret.put("apps", apps);
            ret.put("appCount", apps.length());
            ret.put("totalMs", total);
            ret.put("scannedEvents", scanned);
            ret.put("eventSample", hist);
        } catch (Exception e) {
            ret.put("error", String.valueOf(e.getMessage()));
            Log.w(TAG, "usageEvents failed", e);
        }
        call.resolve(ret);
    }

    /* ══════════════════ 2.7 支付通知 ══════════════════ */

    /** 取走并清空缓冲的微信/支付宝通知原文 */
    @PluginMethod
    public void drainNotifications(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", PayListenerService.isPermissionGranted(getContext()));
        ret.put("connected", PayListenerService.isConnected());
        ret.put("disconnects", PayListenerService.getDisconnectCount());
        ret.put("totalSeen", PayListenerService.getTotalSeen());
        ret.put("totalKept", PayListenerService.getTotalKept());
        try {
            ret.put("notifications", PayListenerService.drain());
        } catch (Exception e) {
            ret.put("error", String.valueOf(e.getMessage()));
        }
        call.resolve(ret);
    }

    /* ══════════════════ 2.8 精确闹钟 ══════════════════ */

    /**
     * 排一个 N 秒后的闹钟，用于验证息屏/省电下能否准时到达。
     *
     * `mode` 决定用哪种接口，以便**对比**：
     *   - `exact`        → setExactAndAllowWhileIdle（在 Doze 下也允许，但有频率限制）
     *   - `alarmClock`   → setAlarmClock（最不易被压制，但系统状态栏会常驻闹钟图标）
     *   - `inexact`      → set（作对照，预期会被系统延迟）
     *
     * 触发结果通过 `snapshot` 的 `lastAlarmFired` 读取；界面也可在等待后自行查询。
     */
    @PluginMethod
    public void scheduleAlarm(PluginCall call) {
        JSObject ret = new JSObject();
        int seconds = call.getInt("seconds", 10);
        String mode = call.getString("mode", "exact");
        String id = call.getString("id", "probe-" + System.currentTimeMillis());

        try {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            if (am == null) {
                ret.put("error", "AlarmManager 不可用");
                call.resolve(ret);
                return;
            }

            Intent intent = new Intent(getContext(), AlarmReceiver.class);
            intent.putExtra(AlarmReceiver.EXTRA_ID, id);
            intent.putExtra(AlarmReceiver.EXTRA_TITLE, "WebBook 探针闹钟");
            intent.putExtra(AlarmReceiver.EXTRA_BODY, "mode=" + mode + "  seconds=" + seconds);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getBroadcast(
                    getContext(), AlarmReceiver.stableId(id), intent, flags);

            long triggerAt = System.currentTimeMillis() + seconds * 1000L;
            boolean exactAllowed = canScheduleExactAlarms();

            try {
                if ("alarmClock".equals(mode)) {
                    Intent show = new Intent(getContext(), MainActivity.class);
                    PendingIntent showPi = PendingIntent.getActivity(
                            getContext(), 0, show, flags);
                    am.setAlarmClock(new AlarmManager.AlarmClockInfo(triggerAt, showPi), pi);
                } else if ("inexact".equals(mode)) {
                    am.set(AlarmManager.RTC_WAKEUP, triggerAt, pi);
                } else {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
                    } else {
                        am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi);
                    }
                }
            } catch (SecurityException se) {
                // Android 12+ 未授予「闹钟和提醒」时会走到这里——如实报告，不静默降级
                ret.put("error", "SecurityException: " + se.getMessage());
                ret.put("exactAllowed", false);
                call.resolve(ret);
                return;
            }

            SimpleDateFormat fmt = new SimpleDateFormat("HH:mm:ss", Locale.US);
            ret.put("scheduled", id);
            ret.put("mode", mode);
            ret.put("seconds", seconds);
            ret.put("triggerAtLocal", fmt.format(new Date(triggerAt)));
            ret.put("exactAllowed", exactAllowed);
            ret.put("canPostNotifications", canPostNotifications());
            ret.put("note", "到点后回到本页刷新「最近触发」确认是否真的响了");
        } catch (Exception e) {
            ret.put("error", String.valueOf(e.getMessage()));
            Log.w(TAG, "scheduleAlarm failed", e);
        }
        call.resolve(ret);
    }

    /* ══════════════════ 工具 ══════════════════ */

    /** PACKAGE_USAGE_STATS 是特殊权限，只能靠 AppOps 检查 */
    private boolean hasUsageAccess() {
        try {
            AppOpsManager appOps =
                    (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
            int mode;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                mode = appOps.unsafeCheckOpNoThrow(
                        AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(),
                        getContext().getPackageName());
            } else {
                mode = appOps.checkOpNoThrow(
                        AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(),
                        getContext().getPackageName());
            }
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) {
            Log.w(TAG, "hasUsageAccess failed: " + e.getMessage());
            return false;
        }
    }

    private boolean canPostNotifications() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return true;
        NotificationManager nm =
                (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        return nm != null && nm.areNotificationsEnabled();
    }

    private boolean canScheduleExactAlarms() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }

    /** 本地时区某自然日的 [start, end) 毫秒区间 */
    private long[] localDayRange(String date) {
        String[] parts = date.split("-");
        Calendar c = Calendar.getInstance();
        c.clear();
        c.set(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]) - 1, Integer.parseInt(parts[2]),
                0, 0, 0);
        long start = c.getTimeInMillis();
        // 结束点额外放宽一天：部分 ROM 的日桶会滞后落到次日
        long end = start + 2L * 24 * 60 * 60 * 1000;
        return new long[]{start, end};
    }

    private String todayLocal() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    /** 包名 → 应用显示名；解析失败回退为包名 */
    private String labelOf(String pkg) {
        try {
            PackageManager pm = getContext().getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
            return String.valueOf(pm.getApplicationLabel(info));
        } catch (Exception e) {
            return pkg;
        }
    }
}
