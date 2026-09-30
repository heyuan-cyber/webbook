package io.github.heyuan_cyber.webbook;

import android.app.Application;
import android.content.Context;
import android.util.Log;

/**
 * 应用入口：持有进程级 Context，供开机重建闹钟使用。
 *
 * ## 为什么需要
 *
 * {@link BootReceiver} 在开机广播里运行，此时**没有 Activity、也没有 Plugin 实例**，
 * 但它必须读回排程影子副本才能重建闹钟。持有 Application 实例是安全的：
 * 它的生命周期与进程一致，不存在泄漏。
 *
 * ## 为什么不直接用 Capacitor 默认的 Application
 *
 * Capacitor 需要一个 Application 子类来做桥的早期初始化。本类继承 Application 并
 * 在 `onCreate` 里先调用 `super`，因此不影响 Capacitor 自身通过
 * `BridgeActivity` 完成的初始化——Capacitor 8 不要求自定义 Application。
 */
public class WebBookApp extends Application {

    private static final String TAG = "WebBookApp";

    private static Context appContext = null;

    @Override
    public void onCreate() {
        super.onCreate();
        appContext = getApplicationContext();
        Log.i(TAG, "application created; context captured for boot-time alarm restore");
    }

    /** 可能为 null（进程刚起、onCreate 尚未执行）——调用方必须判空 */
    static Context context() {
        return appContext;
    }
}
