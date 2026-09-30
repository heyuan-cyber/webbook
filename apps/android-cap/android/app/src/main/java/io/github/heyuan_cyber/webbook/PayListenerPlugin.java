package io.github.heyuan_cyber.webbook;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 支付通知桥（tasks 6.9 / 6.10 / 6.11）。
 *
 * 真正的监听逻辑在 {@link PayListenerService}；本插件只是把它暴露给 Web 层，
 * 并负责授权引导与健康状态上报。
 *
 * ## 边界：只搬运，不解析
 *
 * 本插件**不做任何金额/商户/收支方向的判断**，只把原始 title / text / pkg / postedAt
 * 交给 Web 层。解析规则写在 Kotlin 里意味着微信改个文案就要重新出包；
 * 写在 TypeScript 里则随网页一起更新（design.md D2）。
 *
 * ## 原始文本不落盘
 *
 * `drain()` 取走即清空缓冲区。`PayListenerService` 不写文件、不上传，
 * 原始通知文本只在设备内存中存活。
 *
 * ## 授权与连接必须分开报告
 *
 * 未授予通知使用权时，系统**根本不会绑定监听服务且不报错**，
 * `connected` 会一直是 false。把两者混成一个字段，会把"没授权"误判成"监听坏了"，
 * 然后在错误的方向上排查很久。
 */
@CapacitorPlugin(name = "PayListener")
public class PayListenerPlugin extends Plugin {

    private static final String TAG = "WebBookPayListener";

    /* ══════════════════ 取走通知 ══════════════════ */

    @PluginMethod
    public void drain(PluginCall call) {
        JSObject ret = new JSObject();
        Context ctx = getContext();
        try {
            ret.put("granted", PayListenerService.isPermissionGranted(ctx));
            ret.put("connected", PayListenerService.isConnected());
            ret.put("disconnects", PayListenerService.getDisconnectCount());
            ret.put("totalSeen", PayListenerService.getTotalSeen());
            ret.put("totalKept", PayListenerService.getTotalKept());
            ret.put("notifications", PayListenerService.drain());
        } catch (Exception e) {
            ret.put("notifications", new com.getcapacitor.JSArray());
            ret.put("error", String.valueOf(e.getMessage()));
            Log.w(TAG, "drain failed", e);
        }
        call.resolve(ret);
    }

    /* ══════════════════ 权限 ══════════════════ */

    @PluginMethod
    public void hasPermission(PluginCall call) {
        JSObject ret = new JSObject();
        Context ctx = getContext();
        ret.put("granted", PayListenerService.isPermissionGranted(ctx));
        ret.put("connected", PayListenerService.isConnected());
        ret.put("disconnects", PayListenerService.getDisconnectCount());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            ret.put("opened", true);
        } catch (Exception e) {
            ret.put("opened", false);
            ret.put("error", String.valueOf(e.getMessage()));
        }
        call.resolve(ret);
    }

    /* ══════════════════ 健康检查（tasks 6.11）══════════════════ */

    /**
     * 监听服务的健康状态。
     *
     * 为什么需要：通知监听**会被系统在内存压力下解绑**，而且解绑是静默的——
     * 应用不会收到任何回调，只会表现为"支付不再被记录"。用户很难把
     * "这周没记到账" 与 "服务被解绑了" 联系起来。
     *
     * 因此这里主动探测两件事：
     *   1. 服务当前是否仍被系统绑定（`NotificationListenerService.requestRebind`）
     *   2. 距离上次收到通知过了多久（长时间为 0 且已授权，说明可能已失效）
     *
     * 重绑只在"已授权但未连接"时才发起——未授权时重绑是无效操作，
     * 而且会在系统日志里留下噪声。
     */
    @PluginMethod
    public void healthCheck(PluginCall call) {
        JSObject ret = new JSObject();
        Context ctx = getContext();
        boolean granted = PayListenerService.isPermissionGranted(ctx);
        boolean connected = PayListenerService.isConnected();

        ret.put("granted", granted);
        ret.put("connected", connected);
        ret.put("disconnects", PayListenerService.getDisconnectCount());
        ret.put("totalSeen", PayListenerService.getTotalSeen());
        ret.put("totalKept", PayListenerService.getTotalKept());
        ret.put("lastEventAt", PayListenerService.getLastEventAt());
        ret.put("buffered", PayListenerService.bufferedCount());

        boolean rebindAttempted = false;
        if (granted && !connected) {
            // 已授权但掉线：请求系统重新绑定。这是静默失效的唯一可自愈点。
            try {
                ComponentName cn = new ComponentName(ctx, PayListenerService.class);
                PayListenerService.requestRebind(cn);
                rebindAttempted = true;
                Log.i(TAG, "requested rebind of notification listener");
            } catch (Exception e) {
                Log.w(TAG, "requestRebind failed: " + e.getMessage());
                ret.put("rebindError", String.valueOf(e.getMessage()));
            }
        }
        ret.put("rebindAttempted", rebindAttempted);

        // 给界面一个可直接展示的判定，省得它自己拼逻辑
        String state;
        if (!granted) state = "not_granted";
        else if (!connected) state = rebindAttempted ? "rebinding" : "disconnected";
        else state = "ok";
        ret.put("state", state);
        call.resolve(ret);
    }
}
