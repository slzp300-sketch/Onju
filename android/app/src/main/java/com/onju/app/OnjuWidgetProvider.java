package com.onju.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** 온주 — 오늘의 숲 위젯. 스냅샷을 그리고, 체크 탭을 보류 큐에 쌓는다. */
public class OnjuWidgetProvider extends AppWidgetProvider {

    private static final String ACTION_CHECK = "com.onju.app.WIDGET_CHECK";
    private static final String[] TREE_EMOJI = { "🌰", "🌱", "🌿", "🪴", "🌳" };

    private static final int[] ROW_IDS = { R.id.row_0, R.id.row_1, R.id.row_2 };
    private static final int[] CHECK_IDS = { R.id.check_0, R.id.check_1, R.id.check_2 };
    private static final int[] EMOJI_IDS = { R.id.emoji_0, R.id.emoji_1, R.id.emoji_2 };
    private static final int[] TITLE_IDS = { R.id.title_0, R.id.title_1, R.id.title_2 };
    private static final int[] PLAY_IDS = { R.id.play_0, R.id.play_1, R.id.play_2 };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateWidget(ctx, mgr, id);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (ACTION_CHECK.equals(intent.getAction())) {
            String id = intent.getStringExtra("id");
            if (id != null) {
                String kind = intent.getStringExtra("kind");
                String date = intent.getStringExtra("date");
                WidgetStore.appendPending(ctx, kind != null ? kind : "faith", id,
                        date != null ? date : todayIso());
                refreshAll(ctx);
            }
        }
    }

    /** 모든 위젯 인스턴스를 다시 그린다(플러그인 sync/onReceive에서 호출). */
    public static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        ComponentName cn = new ComponentName(ctx, OnjuWidgetProvider.class);
        for (int id : mgr.getAppWidgetIds(cn)) updateWidget(ctx, mgr, id);
    }

    private static void updateWidget(Context ctx, AppWidgetManager mgr, int appWidgetId) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.onju_widget);
        // 본문 탭 → 앱 열기 (딥링크 onju://home)
        v.setOnClickPendingIntent(R.id.widget_root, openAppIntent(ctx));

        JSONObject snap = parse(WidgetStore.readSnapshot(ctx));
        JSONObject tree = snap != null ? snap.optJSONObject("tree") : null;
        if (tree == null) {
            v.setViewVisibility(R.id.ll_content, View.GONE);
            v.setViewVisibility(R.id.tv_empty, View.VISIBLE);
            mgr.updateAppWidget(appWidgetId, v);
            return;
        }
        v.setViewVisibility(R.id.tv_empty, View.GONE);
        v.setViewVisibility(R.id.ll_content, View.VISIBLE);

        // ── 나무 ──
        int stage = tree.optInt("stage", 0);
        v.setTextViewText(R.id.tv_tree_emoji, TREE_EMOJI[Math.max(0, Math.min(4, stage))]);
        v.setTextViewText(R.id.tv_stage_name, tree.optString("stageName", "씨앗"));
        String health = tree.optString("health", "healthy");
        v.setTextColor(R.id.tv_health_dot, healthColor(health));
        v.setTextViewText(R.id.tv_health_label, healthLabel(health));

        // ── 오늘 달성률 + 스트릭 (rate -1 = 예정 없음 → "—") ──
        JSONObject today = snap.optJSONObject("today");
        int p = today != null ? today.optInt("personalRate", 0) : 0;
        int f = today != null ? today.optInt("faithRate", 0) : 0;
        v.setProgressBar(R.id.pb_personal, 100, Math.max(0, p), false);
        v.setTextViewText(R.id.tv_personal_pct, p < 0 ? "—" : (p + "%"));
        v.setProgressBar(R.id.pb_faith, 100, Math.max(0, f), false);
        v.setTextViewText(R.id.tv_faith_pct, f < 0 ? "—" : (f + "%"));
        int streak = today != null ? today.optInt("streak", 0) : 0;
        v.setTextViewText(R.id.tv_streak, streak > 0 ? ("🔥 " + streak) : "");

        // ── 오늘 미완료 체크 행 ──
        JSONArray pending = snap.optJSONArray("pending");
        Set<String> tapped = tappedToday(ctx);
        String date = todayIso();
        for (int i = 0; i < 3; i++) {
            JSONObject item = pending != null && i < pending.length() ? pending.optJSONObject(i) : null;
            if (item == null) {
                v.setViewVisibility(ROW_IDS[i], View.GONE);
                continue;
            }
            String id = item.optString("id");
            String kind = item.optString("kind", "faith");
            String emoji = item.optString("emoji", "");
            String timer = item.optString("timer", "");
            v.setViewVisibility(ROW_IDS[i], View.VISIBLE);
            v.setTextViewText(TITLE_IDS[i], item.optString("title", ""));
            v.setTextViewText(EMOJI_IDS[i], emoji.isEmpty() ? "·" : emoji);

            if ("routine".equals(kind)) {
                // 루틴 타이머 세션 — 체크 없이 ▶로 진입
                v.setTextViewText(CHECK_IDS[i], "▶");
                v.setTextColor(CHECK_IDS[i], 0xFF2F9E60);
                v.setViewVisibility(PLAY_IDS[i], View.GONE);
                v.setOnClickPendingIntent(ROW_IDS[i],
                        timerIntent(ctx, appWidgetId * 31 + 100 + i, "onju://timer/routine/" + id));
            } else {
                boolean checked = tapped.contains(id);
                v.setTextViewText(CHECK_IDS[i], checked ? "✔" : "○");
                v.setTextColor(CHECK_IDS[i], checked ? 0xFF2F9E60 : 0xFFB0B5B0);
                if (!checked) {
                    v.setOnClickPendingIntent(ROW_IDS[i], checkIntent(ctx, appWidgetId, i, kind, id, date));
                }
                // 타이머 가능 습관이면 우측 ▶ (집중/2분)
                String url = "focus".equals(timer) ? ("onju://timer/focus/" + id)
                        : "twomin".equals(timer) ? ("onju://timer/twomin/" + id) : null;
                if (url != null) {
                    v.setViewVisibility(PLAY_IDS[i], View.VISIBLE);
                    v.setOnClickPendingIntent(PLAY_IDS[i], timerIntent(ctx, appWidgetId * 31 + 100 + i, url));
                } else {
                    v.setViewVisibility(PLAY_IDS[i], View.GONE);
                }
            }
        }

        mgr.updateAppWidget(appWidgetId, v);
    }

    /** 오늘 날짜로 보류 큐에 들어있는 항목 id 집합(낙관적 체크 표시용). */
    private static Set<String> tappedToday(Context ctx) {
        Set<String> set = new HashSet<>();
        String today = todayIso();
        JSONArray arr = parseArray(WidgetStore.readPending(ctx));
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o != null && today.equals(o.optString("date"))) set.add(o.optString("id"));
            }
        }
        return set;
    }

    private static PendingIntent checkIntent(Context ctx, int appWidgetId, int index,
                                             String kind, String id, String date) {
        Intent i = new Intent(ctx, OnjuWidgetProvider.class)
                .setAction(ACTION_CHECK)
                // 고유 data로 PendingIntent 충돌 방지(extras는 동등성 비교에서 제외됨)
                .setData(Uri.parse("onjuwidget://check/" + appWidgetId + "/" + id))
                .putExtra("id", id).putExtra("kind", kind).putExtra("date", date);
        return PendingIntent.getBroadcast(ctx, appWidgetId * 31 + index, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent openAppIntent(Context ctx) {
        return timerIntent(ctx, 0, "onju://home");
    }

    /** onju:// 딥링크로 앱을 여는 activity PendingIntent (위젯 탭 → 타이머 진입). */
    private static PendingIntent timerIntent(Context ctx, int req, String url) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(ctx.getPackageName());
        return PendingIntent.getActivity(ctx, req, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static int healthColor(String health) {
        switch (health) {
            case "wilted": return 0xFF9AA0A6;
            case "dry": return 0xFFC8922A;
            default: return 0xFF2F9E60;
        }
    }

    private static String healthLabel(String health) {
        switch (health) {
            case "wilted": return "시듦";
            case "dry": return "보통";
            default: return "건강";
        }
    }

    private static String todayIso() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    private static JSONObject parse(String s) {
        try { return new JSONObject(s); } catch (Exception e) { return null; }
    }

    private static JSONArray parseArray(String s) {
        try { return new JSONArray(s); } catch (Exception e) { return null; }
    }
}
