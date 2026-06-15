package com.onju.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 홈 위젯 ↔ 앱 공유 저장소 (SharedPreferences "onju_widget").
 * - snapshot: 앱이 쓰고 위젯이 읽는 한입 요약 JSON
 * - pending: 위젯에서 체크한 보류 액션 큐(JSON 배열). 앱이 다음 실행 때 비우며 반영.
 */
public final class WidgetStore {
    private static final String PREFS = "onju_widget";
    private static final String KEY_SNAPSHOT = "snapshot";
    private static final String KEY_PENDING = "pending";

    private WidgetStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void writeSnapshot(Context ctx, String json) {
        prefs(ctx).edit().putString(KEY_SNAPSHOT, json).apply();
    }

    public static String readSnapshot(Context ctx) {
        return prefs(ctx).getString(KEY_SNAPSHOT, "{}");
    }

    /** 위젯 체크 탭을 보류 큐에 추가. */
    public static synchronized void appendPending(Context ctx, String kind, String id, String date) {
        SharedPreferences p = prefs(ctx);
        String raw = p.getString(KEY_PENDING, "[]");
        try {
            JSONArray arr = new JSONArray(raw);
            JSONObject o = new JSONObject();
            o.put("kind", kind);
            o.put("id", id);
            o.put("date", date);
            o.put("ts", System.currentTimeMillis());
            arr.put(o);
            p.edit().putString(KEY_PENDING, arr.toString()).apply();
        } catch (Exception e) {
            p.edit().putString(KEY_PENDING, "[]").apply();
        }
    }

    /** 보류 큐 raw JSON 읽기(비우지 않음) — 위젯 렌더 시 낙관적 체크 표시용. */
    public static String readPending(Context ctx) {
        return prefs(ctx).getString(KEY_PENDING, "[]");
    }

    /** 보류 큐를 읽고 비운다(원자적). 앱 reconcile 전용. */
    public static synchronized String consumePending(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String raw = p.getString(KEY_PENDING, "[]");
        p.edit().putString(KEY_PENDING, "[]").apply();
        return raw;
    }
}
