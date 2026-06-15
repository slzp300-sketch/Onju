package com.onju.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** 웹 앱 ↔ 홈 위젯 다리. SharedPreferences에 스냅샷/보류 큐를 주고받는다. */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    @PluginMethod
    public void sync(PluginCall call) {
        String json = call.getString("json", "{}");
        WidgetStore.writeSnapshot(getContext(), json);
        OnjuWidgetProvider.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void consumePending(PluginCall call) {
        String pending = WidgetStore.consumePending(getContext());
        // 큐를 비웠으니 위젯도 최신 상태로 다시 그린다(낙관적 체크 정리).
        OnjuWidgetProvider.refreshAll(getContext());
        JSObject ret = new JSObject();
        ret.put("json", pending);
        call.resolve(ret);
    }
}
