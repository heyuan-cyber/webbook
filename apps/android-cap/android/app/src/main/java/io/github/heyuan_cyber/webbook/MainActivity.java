package io.github.heyuan_cyber.webbook;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 插件必须在 super.onCreate 之前注册，否则桥初始化完才发现插件，
        // 前端第一次调用会拿到 "not implemented"。
        registerPlugin(ReminderAlarmPlugin.class);
        registerPlugin(UsageStatsPlugin.class);
        registerPlugin(PayListenerPlugin.class);
        // 诊断用探针插件保留：它无需改代码就能确认三项权限与桥的状态，
        // Phase 0 已证明这个能力省下的排查时间远超它的体积。
        registerPlugin(ProbePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
