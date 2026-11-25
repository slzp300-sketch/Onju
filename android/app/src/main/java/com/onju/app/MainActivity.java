package com.onju.app;

import android.os.Bundle;
import android.os.Build;
import android.content.pm.PackageInfo;
import androidx.activity.EdgeToEdge;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridgePlugin.class);
        super.onCreate(savedInstanceState);
        // Capacitor 8.4 adds IME padding for WebView 140+ with viewport-fit=cover.
        // Match that mode on pre-Android 15 devices to avoid adjustResize + padding twice.
        // Older WebViews still use the OS resize path and need its system-bar bounds.
        PackageInfo webView = Build.VERSION.SDK_INT >= 26 ? WebView.getCurrentWebViewPackage() : null;
        int webViewMajor = 0;
        if (webView != null && webView.versionName != null) {
            try { webViewMajor = Integer.parseInt(webView.versionName.split("\\.")[0]); }
            catch (NumberFormatException ignored) { /* Keep the OS fallback. */ }
        }
        if (Build.VERSION.SDK_INT >= 35 || webViewMajor >= 140) {
            EdgeToEdge.enable(this);
        }
    }
}
