package com.onju.app;

import android.os.Build;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.view.WindowManager;
import androidx.test.core.app.ActivityScenario;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Run only #screensAndNavigation; inherited helpers exercise the physical WebView without record writes. */
public class ScreenReviewTest extends PaletteReadinessTest {
    @Override File folder(){File f=new File(activity.getExternalFilesDir(null),"screens-evidence");f.mkdirs();return f;}
    String tab(String label){return "[...document.querySelectorAll('[role=tab]')].find(b=>b.textContent.trim()==="+JSONObject.quote(label)+")";}
    void screen(String name)throws Exception{colors("document.documentElement",name);shot(name);}
    void fit(String name)throws Exception{
        JSONObject m=new JSONObject(js("(()=>{const r=document.querySelector('.home-growth-summary')?.getBoundingClientRect(),p=document.querySelector('.home-routine-sheet')?.getBoundingClientRect();return {name:"+JSONObject.quote(name)+",width:innerWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,growthBottom:r?.bottom,routineTop:p?.top,height:innerHeight}})()"));
        assertTrue("Horizontal fit: "+name,m.getInt("overflow")<=1);
        if(m.has("growthBottom")){assertTrue("Growth above daily practice",m.getDouble("growthBottom")<=m.getDouble("routineTop"));assertTrue("Daily practice reachable on first screen",m.getDouble("routineTop")<m.getDouble("height")-68);}
        checks.put(m);
    }
    @Test public void screensAndNavigation()throws Exception{
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(a->{activity=a;web=a.getBridge().getWebView();a.setTurnScreenOn(true);a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);});
            waitFor("innerWidth>0&&document.querySelector('#root')?.childElementCount>0");
            route("/","!!document.querySelector('.home-goal-card')");
            String before=records(),themeBefore=js("localStorage.getItem('theme-store')"),settingsBefore=js("localStorage.getItem('settings-store')");
            fit("home-order");screen("01-home");
            String goalTitle=new JSONArray(js("[document.querySelector('.home-goal-card .line-clamp-2').textContent]")).getString(0);
            tap("document.querySelector('.home-goal-card')");
            waitFor("location.pathname==='/goals'&&!!document.querySelector('.monthly-goal-paper-card>button[aria-expanded=true]')");
            assertTrue("Selected home goal opens directly",js("document.querySelector('.monthly-goal-paper-card>button[aria-expanded=true]').getAttribute('aria-label')").contains(goalTitle));
            waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='수정')");
            SystemClock.sleep(350);
            assertTrue("Edit and delete touch height","true".equals(js("[...document.querySelectorAll('.monthly-goal-paper-card button')].filter(b=>['수정','삭제'].includes(b.textContent.trim())).every(b=>b.getBoundingClientRect().height>=44)")));
            screen("02-goal-detail");
            route("/stats","!!document.querySelector('.stats-paper-card')");screen("03-stats-weekly");
            tap(tab("목표"));waitFor("("+tab("목표")+").getAttribute('aria-selected')==='true'");SystemClock.sleep(450);screen("04-stats-goal");
            tap("document.querySelector('button.stats-paper-card')");waitFor("location.pathname==='/goals'&&!!document.querySelector('.monthly-goal-paper-card>button[aria-expanded=true]')");
            route("/stats","!!document.querySelector('.stats-paper-card')");
            tap(tab("습관"));waitFor("!!document.querySelector('.habit-stat-mark')");SystemClock.sleep(350);screen("05-stats-habit");
            tap(tab("기록"));waitFor("("+tab("기록")+").getAttribute('aria-selected')==='true'");SystemClock.sleep(450);screen("06-stats-records");
            route("/groups","!!document.querySelector('.group-paper-card')");screen("07-groups");
            tap("document.querySelector('.group-paper-card')");waitFor("!!document.querySelector('.group-detail-hero')");SystemClock.sleep(350);screen("08-group-detail");
            route("/groups","!!document.querySelector('.groups-paper')");tap(tab("탐색"));waitFor("!!document.querySelector('.group-paper-card')");SystemClock.sleep(350);screen("09-group-discover");
            route("/profile","!!document.querySelector('.profile-settings-card')");screen("10-profile");
            assertTrue("Settings controls fit touch targets","true".equals(js("[...document.querySelectorAll('.profile-settings-card [role=tab]')].every(b=>b.getBoundingClientRect().height>=44)")));
            tap("document.querySelector('.profile-theme-card button')");waitFor("document.querySelectorAll('.theme-reward-card').length===5");

            // Resize just this test Activity's WebView to check narrow layouts, never device display settings.
            double baseViewport=new JSONArray(js("[innerWidth]")).getDouble(0);int basePixels=web.getWidth();
            AtomicReference<Integer> originalWidth=new AtomicReference<>();instrumentation.runOnMainSync(()->originalWidth.set(web.getLayoutParams().width));
            try{
                for(int width:new int[]{390,320}){
                    instrumentation.runOnMainSync(()->{ViewGroup.LayoutParams p=web.getLayoutParams();p.width=(int)Math.round(basePixels*width/baseViewport);web.setLayoutParams(p);});
                    waitFor("Math.abs(innerWidth-"+width+")<=1");
                    route("/","!!document.querySelector('.home-growth-summary')");fit("home-"+width);
                    if(width==320)shot("11-home-320");
                    route("/goals","!!document.querySelector('.monthly-goal-paper-card')");fit("goals-"+width);
                    route("/stats","!!document.querySelector('.stats-paper-card')");fit("stats-"+width);
                    route("/groups","!!document.querySelector('.group-paper-card')");fit("groups-"+width);
                    route("/profile","!!document.querySelector('.profile-settings-card')");fit("profile-"+width);
                }
            }finally{instrumentation.runOnMainSync(()->{ViewGroup.LayoutParams p=web.getLayoutParams();p.width=originalWidth.get();web.setLayoutParams(p);});}
            assertEquals("Existing records preserved",before,records());
            assertEquals("Selected theme preserved",themeBefore,js("localStorage.getItem('theme-store')"));
            assertEquals("Settings preserved",settingsBefore,js("localStorage.getItem('settings-store')"));
            JSONObject result=new JSONObject().put("model",Build.MODEL).put("android",Build.VERSION.RELEASE).put("fixtureOnly",true)
                .put("recordsPreserved",true).put("themePreserved",true).put("settingsPreserved",true)
                .put("homeGoalOpensDetail",true).put("statsGoalOpensDetail",true).put("checks",checks);
            try(var out=new FileOutputStream(new File(folder(),"results.json"))){out.write(result.toString(2).getBytes(StandardCharsets.UTF_8));}
        }
    }
}
