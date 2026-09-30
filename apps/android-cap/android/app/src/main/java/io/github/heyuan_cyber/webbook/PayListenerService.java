package io.github.heyuan_cyber.webbook;

import android.app.Notification;
import android.content.ComponentName;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 支付通知监听（native-android-companion 的 tasks 6.9 / 6.10）。
 *
 * ## 只搬运，不解析
 *
 * 本类**不做任何金额/商户/收支方向的解析**——只把通知的原始标题、正文、来源包名
 * 与时刻交给上层。理由：微信/支付宝的文案会随版本变化，解析规则写在 Kotlin 里意味着
 * 改一条正则就要重新出包；写在 Web 层则随网页一起更新（design.md D2）。
 *
 * ## 只保留声明的渠道
 *
 * 其余应用的通知一律丢弃且不保存（spec 的「仅处理声明的渠道」）。
 *
 * ## 原始文本不落盘
 *
 * 缓冲区只在内存中，`drain()` 取走即清空，不写文件、不上传。上传的内容由 Web 层
 * 解析后只含结构字段。
 *
 * ## 授权与否不等于连接与否
 *
 * 用户未在「通知使用权」中授权时，系统根本不会绑定本服务，且**不会报错**。
 * 因此 `isConnected()` 与 `isPermissionGranted()` 必须分开报告，否则会把
 * "没授权"误判成"监听坏了"。
 */
public class PayListenerService extends NotificationListenerService {

    private static final String TAG = "WebBookPayListener";

    /** 微信与支付宝的包名——与 packages/shared 的 PAY_SOURCE_PACKAGES 保持一致 */
    private static final String PKG_WECHAT = "com.tencent.mm";
    private static final String PKG_ALIPAY = "com.eg.android.AlipayGphone";

    /** 缓冲上限：足够覆盖一次后台周期，又不至于无限增长 */
    private static final int MAX_BUFFER = 200;

    private static final Object LOCK = new Object();
    private static final List<JSONObject> BUFFER = new ArrayList<>();
    private static volatile boolean connected = false;
    private static volatile long lastEventAt = 0L;
    private static volatile int totalSeen = 0;
    private static volatile int totalKept = 0;

    private static PayListenerService instance = null;

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        connected = true;
        instance = this;
        lastConnectedAt = System.currentTimeMillis();
        Log.i(TAG, "listener connected");
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        connected = false;
        instance = null;
        disconnectCount++;
        lastDisconnectedAt = System.currentTimeMillis();
        Log.w(TAG, "listener disconnected (total " + disconnectCount + ")");

        // 系统通常会自动重绑，但间隔不确定。主动请求一次可以明显缩短
        // "支付不再被记录" 的窗口期——这段窗口用户是察觉不到的。
        try {
            requestRebind(new ComponentName(this, PayListenerService.class));
            Log.i(TAG, "requested rebind after disconnect");
        } catch (Exception e) {
            Log.w(TAG, "rebind request failed: " + e.getMessage());
        }
    }

    private static volatile int disconnectCount = 0;
    private static volatile long lastConnectedAt = 0L;
    private static volatile long lastDisconnectedAt = 0L;

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;
        lastEventAt = System.currentTimeMillis();
        totalSeen++;

        String pkg = sbn.getPackageName();
        if (!PKG_WECHAT.equals(pkg) && !PKG_ALIPAY.equals(pkg)) {
            // 非声明渠道：直接丢弃，不入缓冲、不落盘
            return;
        }

        Bundle extras = sbn.getNotification().extras;
        if (extras == null) return;

        String title = str(extras.getCharSequence(Notification.EXTRA_TITLE));
        String text = str(extras.getCharSequence(Notification.EXTRA_TEXT));
        // 部分通知把正文放在 BIG_TEXT / 多行里，优先取更长的那个
        String bigText = str(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        String textLines = joinLines(extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES));
        String body = longest(text, bigText, textLines);

        if (title.isEmpty() && body.isEmpty()) return;

        try {
            JSONObject o = new JSONObject();
            o.put("title", title);
            o.put("text", body);
            o.put("pkg", pkg);
            o.put("postedAt", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
                    java.util.Locale.US).format(new java.util.Date(sbn.getPostTime())));
            o.put("source", PKG_WECHAT.equals(pkg) ? "wechat" : "alipay");
            synchronized (LOCK) {
                if (BUFFER.size() >= MAX_BUFFER) BUFFER.remove(0);
                BUFFER.add(o);
                totalKept++;
            }
        } catch (Exception e) {
            Log.w(TAG, "build notification json failed: " + e.getMessage());
        }
    }

    /** 取走并清空（tasks 6.10：取走即清空，原始文本不落盘） */
    static JSONArray drain() {
        JSONArray arr = new JSONArray();
        synchronized (LOCK) {
            for (JSONObject o : BUFFER) arr.put(o);
            BUFFER.clear();
        }
        return arr;
    }

    static int bufferedCount() {
        synchronized (LOCK) {
            return BUFFER.size();
        }
    }

    static boolean isConnected() {
        return connected;
    }

    static int getTotalSeen() {
        return totalSeen;
    }

    static int getTotalKept() {
        return totalKept;
    }

    static int getDisconnectCount() {
        return disconnectCount;
    }

    static long getLastEventAt() {
        return lastEventAt;
    }

    static long getLastConnectedAt() {
        return lastConnectedAt;
    }

    static long getLastDisconnectedAt() {
        return lastDisconnectedAt;
    }

    /** 授权与连接分开报告：未授权时系统不绑服务，connected 永远为 false 且无报错 */
    static boolean isPermissionGranted(android.content.Context ctx) {
        String flat = android.provider.Settings.Secure.getString(
                ctx.getContentResolver(), "enabled_notification_listeners");
        if (flat == null || flat.isEmpty()) return false;
        String pkg = ctx.getPackageName();
        return flat.contains(pkg);
    }

    private static String str(CharSequence cs) {
        return cs == null ? "" : cs.toString();
    }

    private static String joinLines(CharSequence[] lines) {
        if (lines == null || lines.length == 0) return "";
        StringBuilder sb = new StringBuilder();
        for (CharSequence l : lines) {
            if (l == null) continue;
            if (sb.length() > 0) sb.append('\n');
            sb.append(l);
        }
        return sb.toString();
    }

    private static String longest(String... candidates) {
        String best = "";
        for (String c : candidates) {
            if (c != null && c.length() > best.length()) best = c;
        }
        return best;
    }

    /** 便于调试：列出已授权的监听器（不涉及通知内容） */
    static List<String> grantedListeners(android.content.Context ctx) {
        String flat = android.provider.Settings.Secure.getString(
                ctx.getContentResolver(), "enabled_notification_listeners");
        if (flat == null || flat.isEmpty()) return Collections.emptyList();
        List<String> out = new ArrayList<>();
        Collections.addAll(out, flat.split(":"));
        return out;
    }
}
