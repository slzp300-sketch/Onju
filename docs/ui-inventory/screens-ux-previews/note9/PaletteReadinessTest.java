package com.onju.app;

import android.graphics.Bitmap;
import android.os.Build;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Physical-device visual check in the existing isolated fixture app. No record writes or theme apply. */
@RunWith(AndroidJUnit4.class)
public class PaletteReadinessTest {
    final android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
    WebView web;
    MainActivity activity;
    final JSONArray checks=new JSONArray();
    String js(String source)throws Exception{
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
        instrumentation.runOnMainSync(()->web.evaluateJavascript(source,r->{value.set(r);done.countDown();}));
        assertTrue("WebView callback",done.await(10,TimeUnit.SECONDS));return value.get();
    }
    void waitFor(String condition)throws Exception{
        long until=SystemClock.uptimeMillis()+20000;
        while(SystemClock.uptimeMillis()<until){if("true".equals(js(condition)))return;SystemClock.sleep(100);}
        fail("Readiness: "+condition);
    }
    void tap(String selector)throws Exception{
        waitFor("!!("+selector+")");js("("+selector+").scrollIntoView({block:'nearest'});true");SystemClock.sleep(250);
        JSONArray r=new JSONArray(js("(()=>{const r=("+selector+").getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,innerWidth]})()"));
        int[] xy=new int[2];instrumentation.runOnMainSync(()->web.getLocationOnScreen(xy));
        float scale=(float)web.getWidth()/(float)r.getDouble(2),x=xy[0]+(float)r.getDouble(0)*scale,y=xy[1]+(float)r.getDouble(1)*scale;
        long now=SystemClock.uptimeMillis();
        instrumentation.sendPointerSync(MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,x,y,0));
        instrumentation.sendPointerSync(MotionEvent.obtain(now,now+80,MotionEvent.ACTION_UP,x,y,0));
        instrumentation.waitForIdleSync();
    }
    File folder(){File f=new File(activity.getExternalFilesDir(null),"palette-evidence");f.mkdirs();return f;}
    void shot(String name)throws Exception{
        SystemClock.sleep(400);Bitmap image=instrumentation.getUiAutomation().takeScreenshot();
        try(var out=new FileOutputStream(new File(folder(),name+".png"))){image.compress(Bitmap.CompressFormat.PNG,100,out);}
    }
    void colors(String scope,String name)throws Exception{
        JSONObject result=new JSONObject(js("(()=>{const e="+scope+",s=getComputedStyle(e),color=n=>{const c=document.createElement('canvas').getContext('2d');c.fillStyle=s.getPropertyValue(n).trim();return c.fillStyle.toUpperCase()};return {name:"+JSONObject.quote(name)+",primary:color('--color-primary'),accent:color('--color-accent'),surface:color('--color-surface'),canvas:color('--color-surface-alt'),width:innerWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}})()"));
        assertEquals("#1F4D3A",result.getString("primary"));assertEquals("#F0876E",result.getString("accent"));
        assertEquals("#F3EADF",result.getString("surface"));assertEquals("#FAF0E6",result.getString("canvas"));
        assertTrue("Horizontal fit: "+name,result.getInt("overflow")<=1);checks.put(result);
    }
    String records()throws Exception{
        return js("JSON.stringify(Object.keys(localStorage).filter(k=>k.startsWith('fixture-db:')&&!k.endsWith(':user_settings')).sort().map(k=>[k,localStorage.getItem(k)]))");
    }
    void route(String path,String ready)throws Exception{
        // Navigate through the native WebView, then wait for the new document before evaluating JS.
        // A callback submitted while location.assign replaces the document can be discarded.
        AtomicReference<String> target=new AtomicReference<>();
        instrumentation.runOnMainSync(()->{
            target.set(android.net.Uri.parse(web.getUrl()).buildUpon().path(path).clearQuery().fragment(null).build().toString());
            web.loadUrl(target.get());
        });
        SystemClock.sleep(350);
        long until=SystemClock.uptimeMillis()+20000;boolean loaded=false;
        while(SystemClock.uptimeMillis()<until){
            AtomicReference<Boolean> finished=new AtomicReference<>(false);
            instrumentation.runOnMainSync(()->finished.set(web.getProgress()==100&&target.get().equals(web.getUrl())));
            if(finished.get()){loaded=true;break;}SystemClock.sleep(100);
        }
        assertTrue("Native page load: "+path,loaded);
        waitFor("location.pathname==="+JSONObject.quote(path)+"&&innerWidth>0&&("+ready+")");SystemClock.sleep(350);
    }
    @Test public void calmCardsAndAllThemePreviews()throws Exception{
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(a->{activity=a;web=a.getBridge().getWebView();a.setTurnScreenOn(true);a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);});
            waitFor("innerWidth>0&&document.querySelector('#root')?.childElementCount>0");
            route("/","document.body.innerText.includes('오늘의 실천')");
            String before=records(),themeBefore=js("localStorage.getItem('theme-store')");
            colors("document.documentElement","home");shot("01-home");
            route("/streak","document.body.innerText.includes('나의 나무')");colors("document.documentElement","tree");shot("02-tree");
            route("/themes","document.querySelectorAll('.theme-reward-card').length===5");
            colors("document.documentElement","themes");shot("03-themes");
            String[] ids={"grove","sprout","meadow","deepforest","autumn"};
            for(int i=0;i<ids.length;i++){
                tap("document.querySelectorAll('.theme-reward-card')["+i+"].querySelector('button')");
                waitFor("!!document.querySelector('.theme-preview-sheet [data-theme=\""+ids[i]+"\"]')");
                colors("document.querySelector('.theme-preview-sheet [data-theme]')",ids[i]);
                if(i==4)shot("04-autumn-preview");
                tap("document.querySelector('[aria-label=\"미리보기 닫기\"]')");waitFor("!document.querySelector('.theme-preview-sheet')");
            }
            assertEquals("Existing fixture records preserved",before,records());
            assertEquals("Preview does not change selected theme",themeBefore,js("localStorage.getItem('theme-store')"));
            JSONObject evidence=new JSONObject().put("model",Build.MODEL).put("android",Build.VERSION.RELEASE)
                .put("fixtureOnly",true).put("recordsPreserved",true).put("selectedThemePreserved",true).put("checks",checks);
            try(var out=new FileOutputStream(new File(folder(),"results.json"))){out.write(evidence.toString(2).getBytes(StandardCharsets.UTF_8));}
        }
    }
}
