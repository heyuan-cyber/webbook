package io.github.heyuan_cyber.webbook;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * 开机后重建闹钟排程（tasks 6.6）。
 *
 * 设备重启会清空 AlarmManager 的全部排程。若不重建，用户会看到"提醒再也不响了"
 * 且**毫无提示**——这是最容易被漏掉、也最难排查的一类失效。
 *
 * 数据来源是 {@link ReminderAlarmPlugin} 每次排程时写下的影子副本（只含
 * id / dueAt / title / body 四个字段，不含任何用户数据）。
 *
 * ## 为什么在这里也要过滤过期项
 *
 * 关机期间可能已经过了若干触发时刻。**不能补发**（spec 的「长时间失效后的处理」：
 * 恢复后不集中补发全部过期通知），因此只重排仍在未来的实例。
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "WebBookBoot";

    /** 供界面确认接收器确实被系统调用过（探针用在 checkPermissions 里） */
    static volatile long lastBootSeenAt = 0L;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        lastBootSeenAt = System.currentTimeMillis();
        Log.i(TAG, "boot broadcast: " + action);

        Context app = WebBookApp.context();
        if (app == null) app = context.getApplicationContext();

        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am == null) {
            Log.w(TAG, "AlarmManager unavailable; cannot restore alarms");
            return;
        }

        List<JSONObject> shadow = ReminderAlarmPlugin.loadShadow();
        if (shadow.isEmpty()) {
            Log.i(TAG, "no saved alarms to restore");
            return;
        }

        long now = System.currentTimeMillis();
        int restored = 0;
        int expired = 0;
        List<JSONObject> kept = new ArrayList<>();

        for (JSONObject s : shadow) {
            String id = s.optString("id", "");
            String dueAt = s.optString("dueAt", "");
            if (id.isEmpty() || dueAt.isEmpty()) continue;

            long triggerAt = ReminderAlarmPlugin.parseIso(dueAt);
            if (triggerAt <= now) {
                // 关机期间已过期：不补发，也不再重建
                expired++;
                continue;
            }

            Intent alarm = new Intent(app, AlarmReceiver.class);
            alarm.putExtra(AlarmReceiver.EXTRA_ID, id);
            alarm.putExtra(AlarmReceiver.EXTRA_TITLE, s.optString("title", ""));
            alarm.putExtra(AlarmReceiver.EXTRA_BODY, s.optString("body", ""));

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(
                    app, AlarmReceiver.stableId(id), alarm, flags);

            try {
                boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S
                        || am.canScheduleExactAlarms();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && exact) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
                } else {
                    am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi);
                }
                restored++;
                kept.add(s);
            } catch (SecurityException e) {
                Log.w(TAG, "restore denied for " + id + ": " + e.getMessage());
                kept.add(s); // 保留影子副本，下次开机或权限恢复后再试
            }
        }

        // 只留仍在未来的，避免影子副本随时间无限累积过期项
        ReminderAlarmPlugin.saveShadow(kept);
        Log.i(TAG, "restored " + restored + " alarms, dropped " + expired + " expired");
    }

    static boolean seenBoot() {
        return lastBootSeenAt > 0;
    }
}
