package io.github.heyuan_cyber.webbook;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import java.util.Locale;
import java.util.Map;

/**
 * 闹钟到点投递通知（native-android-companion 的 tasks 6.5）。
 *
 * 与排程侧的分工：{@link ReminderAlarmPlugin} 负责排，本接收器负责响。
 * 之所以走 BroadcastReceiver + NotificationManager 而不是别的：
 * 到点必须在应用未打开、甚至被系统回收时也能弹出，广播接收器是唯一不依赖
 * 应用进程存活的路径。
 *
 * ## 一个真机上被证实的静默失效
 *
 * 探针在小米 23049RAD8C 上发现：**「通知展示权限」被拒时，闹钟照常触发，
 * 但 `nm.notify()` 抛 SecurityException——用户什么都看不到**。
 * 排程成功、触发成功、结果为零，这是最难排查的一类失效。
 *
 * 因此本类不再把该异常悄悄吞掉：{@link #lastDeniedCount} 与 {@link #lastDeniedAt}
 * 会记录下来，由 {@link ReminderAlarmPlugin#checkPermissions} 上报给界面，
 * 让用户看到"提醒在响，但你收不到"而不是以为功能坏了。
 */
public class AlarmReceiver extends BroadcastReceiver {

    private static final String TAG = "WebBookAlarm";
    public static final String CHANNEL_ID = "webbook_reminders";
    public static final String EXTRA_ID = "alarm_id";
    public static final String EXTRA_TITLE = "alarm_title";
    public static final String EXTRA_BODY = "alarm_body";
    public static final String EXTRA_FIRED_AT = "alarm_fired_at";

    /** 最近一次触发记录，供界面确认"真的响了" */
    static volatile String lastFiredId = null;
    static volatile long lastFiredAt = 0L;
    static volatile long lastFiredWallClock = 0L;

    /** 因通知权限被拒而**未能展示**的次数与最近时刻——静默失效的可见化 */
    static volatile int lastDeniedCount = 0;
    static volatile long lastDeniedAt = 0L;
    static volatile String lastDeniedId = null;

    /**
     * 已触发的提醒 id → 触发时刻（毫秒）。
     *
     * 为什么需要累积而不是只记"最近一次"：送达回写是**批量**进行的
     * （手机被唤醒时一次性上报），若只留最近一条，中间触发的那些会被漏掉，
     * 云端就永远认为它们"没送达"，界面上一直显示"已错过"。
     *
     * 上限 200 条并淘汰最旧：这个表只在"触发过但还没回写"的窗口内有意义，
     * 正常情况下每次同步就会被清空。
     */
    private static final int MAX_FIRED = 200;
    private static final java.util.LinkedHashMap<String, Long> FIRED =
            new java.util.LinkedHashMap<String, Long>() {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
                    return size() > MAX_FIRED;
                }
            };

    /** 记录一次触发（按 id 去重，同一提醒重复触发只留一条） */
    static void recordFired(String id) {
        if (id == null || id.isEmpty()) return;
        synchronized (FIRED) {
            FIRED.put(id, System.currentTimeMillis());
        }
    }

    /**
     * 取走并清空触发记录。
     *
     * 语义与 {@link PayListenerService#drain()} 一致：**取走即清空**，
     * 因为调用方取走后会立即回写云端；若回写失败，下次同步会重新拉取
     * `/api/notify/due` 时发现该提醒仍未送达并重排，不会丢失。
     */
    static org.json.JSONArray drainFired() {
        org.json.JSONArray arr = new org.json.JSONArray();
        synchronized (FIRED) {
            for (Map.Entry<String, Long> e : FIRED.entrySet()) {
                try {
                    org.json.JSONObject o = new org.json.JSONObject();
                    o.put("id", e.getKey());
                    o.put("firedAt", e.getValue());
                    arr.put(o);
                } catch (Exception ignored) {
                    // 单条构造失败不影响其余
                }
            }
            FIRED.clear();
        }
        return arr;
    }

    /** 不清空的只读视图，供 checkPermissions 上报 */
    static String firedSummary() {
        synchronized (FIRED) {
            if (FIRED.isEmpty()) return lastFiredSummary();
            StringBuilder sb = new StringBuilder();
            int n = 0;
            for (String id : FIRED.keySet()) {
                if (n++ > 0) sb.append(", ");
                sb.append(id);
                if (n >= 3) break;
            }
            return sb + (FIRED.size() > 3 ? " …共 " + FIRED.size() + " 条" : "");
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra(EXTRA_ID);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);

        lastFiredId = id;
        lastFiredAt = System.currentTimeMillis();
        lastFiredWallClock = System.currentTimeMillis();
        // 累积记录：送达回写是批量的，只留"最近一次"会漏掉中间触发的那些
        recordFired(id);
        Log.i(TAG, "alarm fired: " + id + " at " + lastFiredAt);

        if (title == null || title.isEmpty()) title = "WebBook 提醒";

        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureChannel(nm);

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent content =
                PendingIntent.getActivity(context, (id == null ? "alarm" : id).hashCode(), open, flags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, CHANNEL_ID)
                : new Notification.Builder(context);

        builder.setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body == null ? "" : body)
                .setAutoCancel(true)
                .setContentIntent(content);

        // 通知 id 由 alarm id 派生：同一次触发重复投递会覆盖而不是叠出多条
        int notifyId = id == null ? 1 : stableId(id);
        try {
            nm.notify(notifyId, builder.build());
        } catch (SecurityException e) {
            // Android 13+ 未授予 POST_NOTIFICATIONS。**这条路径是真机上被证实过的静默失效**：
            // 闹钟响了、用户什么都没看到。记下来让界面能如实报告，而不是以为功能坏了。
            lastDeniedCount++;
            lastDeniedAt = System.currentTimeMillis();
            lastDeniedId = id;
            Log.w(TAG, "notify denied (POST_NOTIFICATIONS?): " + e.getMessage());
        }
    }

    /** 是否有过"响了但没展示"的经历 */
    static boolean hasDeniedDelivery() {
        return lastDeniedCount > 0;
    }

    private void ensureChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "提醒", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("WebBook 到点提醒");
        nm.createNotificationChannel(ch);
    }

    /** 由字符串派生稳定正整数 id（与 PendingIntent 的 requestCode 口径一致） */
    static int stableId(String s) {
        return (s.hashCode() & 0x7fffffff) % 100000;
    }

    /** 供探针读取的触发记录 */
    static String lastFiredSummary() {
        if (lastFiredId == null) return "（尚未触发）";
        return String.format(Locale.US, "%s @ %d", lastFiredId, lastFiredWallClock);
    }
}
