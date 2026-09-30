package io.github.heyuan_cyber.webbook;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

/**
 * 提醒排程桥（native-android-companion 的 tasks 6.4 / 6.5 / 6.6）。
 *
 * ## 语义：提交即重建
 *
 * {@link #schedule} 接收一组完整的排程实例，**先取消全部本应用排程再重建**。
 * 调用方必须提交完整窗口内容，只提交增量会导致旧排程被清掉。
 * 之所以这样定：增量同步需要双向 diff，而云端的 `/api/notify/due` 本来就会
 * 返回完整窗口，重建比 diff 简单且不会漂移。
 *
 * ## 幂等靠稳定的 requestCode
 *
 * PendingIntent 的 requestCode 由提醒 id 派生（{@link AlarmReceiver#stableId}），
 * 因此同一提醒重复排程是覆盖而不是堆叠——否则"同一次触发送两次通知"必然发生。
 *
 * ## 重启重建靠本地影子副本
 *
 * AlarmManager 的排程在设备重启后全部丢失。要重建就得知道原来排了什么，
 * 因此每次 {@link #schedule} 都把这组实例写进 SharedPreferences；
 * {@link BootReceiver} 开机后读回并重排。
 *
 * 影子副本里**只放排程必需的四个字段**（id / dueAt / title / body），
 * 不存任何用户数据，且随每次重建整体覆盖。
 */
@CapacitorPlugin(name = "ReminderAlarm")
public class ReminderAlarmPlugin extends Plugin {

    private static final String TAG = "WebBookAlarm";
    private static final String PREFS = "webbook_alarms";
    private static final String KEY_ALARMS = "alarms";

    /* ══════════════════ 排程 ══════════════════ */

    @PluginMethod
    public void schedule(PluginCall call) {
        JSObject ret = new JSObject();
        JSArray input = call.getArray("alarms", new JSArray());
        AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        if (am == null) {
            ret.put("scheduled", 0);
            ret.put("error", "AlarmManager 不可用");
            call.resolve(ret);
            return;
        }

        try {
            // 先把该提醒的旧排程全部取消，避免改时间后旧时刻仍然响
            cancelAllInternal(am);

            int scheduled = 0;
            int skipped = 0;
            List<JSONObject> shadow = new ArrayList<>();
            long now = System.currentTimeMillis();

            for (int i = 0; i < input.length(); i++) {
                JSONObject a = input.optJSONObject(i);
                if (a == null) continue;
                String id = a.optString("id", "");
                String dueAt = a.optString("dueAt", "");
                String title = a.optString("title", "");
                String body = a.optString("body", "");
                if (id.isEmpty() || dueAt.isEmpty()) {
                    skipped++;
                    continue;
                }

                long triggerAt = parseIso(dueAt);
                // 已经过去的时刻不排——补发过期通知会造成骚扰（spec 明确要求不补发）
                if (triggerAt <= now) {
                    skipped++;
                    continue;
                }

                Intent intent = new Intent(getContext(), AlarmReceiver.class);
                intent.putExtra(AlarmReceiver.EXTRA_ID, id);
                intent.putExtra(AlarmReceiver.EXTRA_TITLE, title);
                intent.putExtra(AlarmReceiver.EXTRA_BODY, body);

                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    flags |= PendingIntent.FLAG_IMMUTABLE;
                }
                PendingIntent pi = PendingIntent.getBroadcast(
                        getContext(), AlarmReceiver.stableId(id), intent, flags);

                setAlarm(am, triggerAt, pi);
                scheduled++;

                JSONObject s = new JSONObject();
                s.put("id", id);
                s.put("dueAt", dueAt);
                s.put("title", title);
                s.put("body", body);
                shadow.add(s);
            }

            saveShadow(shadow);

            ret.put("scheduled", scheduled);
            ret.put("skipped", skipped);
            ret.put("exactAllowed", canScheduleExactAlarms());
            ret.put("canPostNotifications", canPostNotifications());
        } catch (Exception e) {
            ret.put("scheduled", 0);
            ret.put("error", String.valueOf(e.getMessage()));
            Log.w(TAG, "schedule failed", e);
        }
        call.resolve(ret);
    }

    /**
     * 排一个闹钟。
     *
     * 优先用 `setExactAndAllowWhileIdle`：它在 Doze 下也允许触发，且不像
     * `setAlarmClock` 那样在状态栏常驻闹钟图标。仅在精确闹钟权限缺失时
     * **降级**为 `setAndAllowWhileIdle` 并如实上报，而不是静默失败。
     */
    private void setAlarm(AlarmManager am, long triggerAt, PendingIntent pi) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && canScheduleExactAlarms()) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // 无精确权限：降级为不精确闹钟，可能被系统延迟数分钟
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            Log.w(TAG, "no exact-alarm permission; fell back to inexact");
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        }
    }

    /* ══════════════════ 取消 ══════════════════ */

    @PluginMethod
    public void cancelAll(PluginCall call) {
        JSObject ret = new JSObject();
        AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        try {
            if (am != null) cancelAllInternal(am);
            saveShadow(new ArrayList<JSONObject>());
            ret.put("ok", true);
        } catch (Exception e) {
            ret.put("ok", false);
            ret.put("error", String.valueOf(e.getMessage()));
        }
        call.resolve(ret);
    }

    /**
     * 取消全部已排程的闹钟。
     *
     * 遍历影子副本逐个 `cancel`，而不是记录一个总 PendingIntent：
     * 因为每个提醒各有自己的 requestCode，只能逐个撤销。
     */
    private void cancelAllInternal(AlarmManager am) {
        for (JSONObject s : loadShadow()) {
            String id = s.optString("id", "");
            if (id.isEmpty()) continue;
            Intent intent = new Intent(getContext(), AlarmReceiver.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(
                    getContext(), AlarmReceiver.stableId(id), intent, flags);
            am.cancel(pi);
        }
    }

    /* ══════════════════ 送达回写（tasks 7.4）══════════════════ */

    /**
     * 取走并清空"已触发但还没回写云端"的记录。
     *
     * 为什么要这个：云端需要区分"已排程"与"已送达"（spec 明确要求）。
     * 判定只能由手机侧给出——只有它知道闹钟到底有没有响。
     *
     * **取走即清空**：调用方取走后立即批量回写云端。若回写失败，该提醒在云端
     * 仍是"未送达"，下次同步会重新排入并在触发时再次记录，因此不会静默丢失。
     */
    @PluginMethod
    public void drainFired(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            ret.put("fired", AlarmReceiver.drainFired());
            ret.put("notificationDenied", AlarmReceiver.hasDeniedDelivery());
            ret.put("notificationDeniedCount", AlarmReceiver.lastDeniedCount);
        } catch (Exception e) {
            ret.put("fired", new JSArray());
            ret.put("error", String.valueOf(e.getMessage()));
            Log.w(TAG, "drainFired failed", e);
        }
        call.resolve(ret);
    }

    /* ══════════════════ 状态回查 ══════════════════ */

    /**
     * 权限与最近一次投递状态。
     *
     * `notificationDenied` 是**界面上必须显示**的一项：真机已证实"通知展示权限被拒时
     * 闹钟照常触发但用户看不到"，若不告诉用户，功能会表现为彻底失效。
     */
    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("canScheduleExactAlarms", canScheduleExactAlarms());
        ret.put("canPostNotifications", canPostNotifications());
        ret.put("scheduledCount", loadShadow().size());
        ret.put("lastFired", AlarmReceiver.lastFiredSummary());
        ret.put("pendingFired", AlarmReceiver.firedSummary());
        ret.put("notificationDeniedCount", AlarmReceiver.lastDeniedCount);
        ret.put("notificationDenied", AlarmReceiver.hasDeniedDelivery());
        ret.put("notificationDeniedAt", AlarmReceiver.lastDeniedAt);
        call.resolve(ret);
    }

    /* ══════════════════ 影子副本 ══════════════════ */

    static void saveShadow(List<JSONObject> alarms) {
        try {
            SharedPreferences sp = prefs();
            if (sp == null) return;
            JSONArray arr = new JSONArray();
            for (JSONObject o : alarms) arr.put(o);
            sp.edit().putString(KEY_ALARMS, arr.toString()).apply();
        } catch (Exception e) {
            Log.w(TAG, "saveShadow failed: " + e.getMessage());
        }
    }

    static List<JSONObject> loadShadow() {
        List<JSONObject> out = new ArrayList<>();
        try {
            SharedPreferences sp = prefs();
            if (sp == null) return out;
            String raw = sp.getString(KEY_ALARMS, "[]");
            JSONArray arr = new JSONArray(raw == null ? "[]" : raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o != null) out.add(o);
            }
        } catch (Exception e) {
            Log.w(TAG, "loadShadow failed: " + e.getMessage());
        }
        return out;
    }

    private static SharedPreferences prefs() {
        Context ctx = WebBookApp.context();
        return ctx == null ? null : ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /* ══════════════════ 工具 ══════════════════ */

    private boolean canScheduleExactAlarms() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }

    private boolean canPostNotifications() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return true;
        NotificationManager nm = (NotificationManager)
                getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        return nm != null && nm.areNotificationsEnabled();
    }

    /** 解析 ISO 8601（含 `Z` 与带偏移两种写法） */
    static long parseIso(String iso) {
        try {
            String s = iso.trim();
            // 统一成 SimpleDateFormat 能识别的形式
            if (s.endsWith("Z")) s = s.substring(0, s.length() - 1) + "+0000";
            else if (s.length() >= 6 && (s.charAt(s.length() - 3) == ':')) {
                String head = s.substring(0, s.length() - 3);
                String tail = s.substring(s.length() - 2);
                s = head + tail;
            }
            SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US);
            fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date d = fmt.parse(s);
            return d == null ? 0L : d.getTime();
        } catch (Exception e) {
            return 0L;
        }
    }
}
