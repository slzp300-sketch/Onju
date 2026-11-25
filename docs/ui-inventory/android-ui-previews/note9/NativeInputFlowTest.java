package com.onju.app;

import android.app.Instrumentation;
import android.content.Context;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
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

/** Isolated fixture APK: real WebView/IME, no live account or backend. */
@RunWith(AndroidJUnit4.class)
public class NativeInputFlowTest {
    final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    WebView webView;
    MainActivity activity;
    final JSONArray evidence = new JSONArray();
    final String label = "기기 입력 검증 " + System.currentTimeMillis();
    String js(String source) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> webView.evaluateJavascript(source, value -> { result.set(value); latch.countDown(); }));
        assertTrue("JavaScript callback", latch.await(10, TimeUnit.SECONDS)); return result.get();
    }
    void waitJs(String condition) throws Exception {
        long until = SystemClock.uptimeMillis() + 15000;
        while (SystemClock.uptimeMillis() < until) {
            if ("true".equals(js(condition))) return;
            SystemClock.sleep(100);
        }
        fail("Condition failed: " + condition + " / " + js("JSON.stringify({path:location.pathname,text:document.body.innerText.slice(-1200)})"));
    }
    String button(String text) { return "[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===" + JSONObject.quote(text) + ")"; }
    String named(String name) { return "document.querySelector('[aria-label=\"" + name + "\"]')"; }
    void tap(String element) throws Exception {
        waitJs("!!(" + element + ")");
        js("(" + element + ").scrollIntoView({block:'nearest'})"); SystemClock.sleep(200);
        JSONArray r = new JSONArray(js("(()=>{const r=("+element+").getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,innerWidth]})()"));
        int[] xy = new int[2]; instrumentation.runOnMainSync(() -> webView.getLocationOnScreen(xy));
        float scale=(float)webView.getWidth()/(float)r.getDouble(2);
        float x=xy[0]+(float)r.getDouble(0)*scale, y=xy[1]+(float)r.getDouble(1)*scale;
        long now=SystemClock.uptimeMillis();
        instrumentation.sendPointerSync(MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,x,y,0));
        instrumentation.sendPointerSync(MotionEvent.obtain(now,now+80,MotionEvent.ACTION_UP,x,y,0));
        instrumentation.waitForIdleSync();
    }
    boolean imeVisible() {
        AtomicReference<Boolean> visible=new AtomicReference<>(false);
        instrumentation.runOnMainSync(()->{ WindowInsetsCompat i=ViewCompat.getRootWindowInsets(webView); visible.set(i!=null&&i.isVisible(WindowInsetsCompat.Type.ime())); });
        return visible.get();
    }
    void keyboard(String element) throws Exception {
        waitJs("!!("+element+")&&!("+element+").matches(':disabled')");
        tap(element);
        waitJs("document.activeElement===("+element+")");
        instrumentation.runOnMainSync(()->{ webView.requestFocus(); ((InputMethodManager)activity.getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(webView,InputMethodManager.SHOW_IMPLICIT); });
        long until=SystemClock.uptimeMillis()+5000;
        while(!imeVisible()&&SystemClock.uptimeMillis()<until)SystemClock.sleep(100);
        assertTrue("실제 소프트 키보드 표시",imeVisible()); SystemClock.sleep(400);
    }
    void input(String text) throws Exception {
        AtomicReference<InputConnection> current = new AtomicReference<>();
        long until=SystemClock.uptimeMillis()+5000;
        do{instrumentation.runOnMainSync(()->current.set(webView.onCreateInputConnection(new EditorInfo())));if(current.get()!=null)break;SystemClock.sleep(100);}while(SystemClock.uptimeMillis()<until);
        InputConnection c=current.get(); assertNotNull(c);
        CountDownLatch completed = new CountDownLatch(1);
        AtomicReference<Throwable> error = new AtomicReference<>();
        Runnable compose=()->{try{c.beginBatchEdit();c.setComposingText(text,1);c.finishComposingText();c.endBatchEdit();}catch(Throwable e){error.set(e);}finally{completed.countDown();}};
        if(c.getHandler()!=null)c.getHandler().post(compose);else instrumentation.runOnMainSync(compose);
        assertTrue(completed.await(5,TimeUnit.SECONDS));if(error.get()!=null)throw new AssertionError(error.get());
        instrumentation.waitForIdleSync();
    }
    void record(String name) throws Exception {
        waitJs("!document.querySelector('[aria-label=\"불러오는 중\"]')");
        SystemClock.sleep(250);
        String value=js("JSON.stringify({path:location.pathname,width:innerWidth,height:innerHeight,viewport:visualViewport?{height:visualViewport.height,top:visualViewport.offsetTop}:null,inset:getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset'),safeTop:getComputedStyle(document.documentElement).getPropertyValue('--app-safe-top'),overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,footer:(()=>{const e=document.querySelector('.form-paper-footer');return e?{top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}:null})()})");
        JSONObject entry=new JSONObject(new JSONArray("["+value+"]").getString(0)); entry.put("name",name);entry.put("ime",imeVisible());evidence.put(entry);
        File folder=new File(activity.getExternalFilesDir(null),"ui-evidence");folder.mkdirs();
        Bitmap shot=instrumentation.getUiAutomation().takeScreenshot();
        try(FileOutputStream out=new FileOutputStream(new File(folder,name+".png"))){shot.compress(Bitmap.CompressFormat.PNG,100,out);}
        try(FileOutputStream out=new FileOutputStream(new File(folder,"results.json"))){out.write(evidence.toString(2).getBytes(StandardCharsets.UTF_8));}
        assertTrue("화면 가로 넘침: "+name+" / "+entry.toString()+" / "+js("JSON.stringify([...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,60)})))"),entry.getInt("overflow")<=1);
    }
    void footerVisible() throws Exception {waitJs("(()=>{const r=document.querySelector('.form-paper-footer').getBoundingClientRect(),v=visualViewport;return r.bottom<=v.height+v.offsetTop+2&&r.top>=v.offsetTop})()");}
    void go(String path,String ready)throws Exception{
        instrumentation.runOnMainSync(()->webView.loadUrl("https://localhost"+path));
        // 새 문서가 교체되는 도중 evaluateJavascript 콜백이 유실되지 않게 기다린다.
        SystemClock.sleep(500);
        AtomicReference<Integer> progress=new AtomicReference<>(0);
        long until=SystemClock.uptimeMillis()+15000;
        do{instrumentation.runOnMainSync(()->progress.set(webView.getProgress()));if(progress.get()==100)break;SystemClock.sleep(100);}while(SystemClock.uptimeMillis()<until);
        waitJs(ready);
    }

    @Test public void realKeyboardDraftAndSave()throws Exception{
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(a->{activity=a;webView=a.getBridge().getWebView();a.setTurnScreenOn(true);a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);});
            waitJs("innerWidth>0&&innerHeight>0");
            waitJs("!!document.querySelector('[aria-label=\"홈 기록 종류\"]')");record("01-home");
            tap("[...document.querySelectorAll('[role=tab]')].find(b=>b.textContent.startsWith('할 일'))");tap(button("할 일 추가"));
            keyboard(named("할 일 이름"));input(label);waitJs(named("할 일 이름")+".value==="+JSONObject.quote(label));
            footerVisible();waitJs("innerHeight>300");waitJs("(()=>{const r=("+named("할 일 이름")+").getBoundingClientRect();return r.top>=0&&r.bottom<document.querySelector('.form-paper-footer').getBoundingClientRect().top})()");record("02-todo-keyboard");
            tap(button("추가하기"));waitJs("location.pathname==='/'");waitJs("document.body.innerText.includes("+JSONObject.quote(label)+")");record("03-todo-saved");

            tap("[...document.querySelectorAll('[role=tab]')].find(b=>b.textContent.startsWith('개인'))");tap(button("실천 추가"));tap("[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('습관 추가'))");
            waitJs("!!document.querySelector('.form-paper-input[type=text]')");
            if("true".equals(js("document.body.innerText.includes('초안 복원')")))tap(button("초안 복원"));
            String title="document.querySelector('.form-paper-input[type=text]')";
            keyboard(title);input(label+" 초안");
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);SystemClock.sleep(400);
            assertFalse("첫 뒤로 가기는 키보드만 닫음",imeVisible());waitJs("location.pathname==='/habits/new'");assertTrue(js(title+".value").contains(label));
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);waitJs("document.body.innerText.includes('저장하지 않고 이동할까요?')");
            tap(button("취소"));waitJs("!document.body.innerText.includes('저장하지 않고 이동할까요?')");assertTrue(js(title+".value").contains(label));
            SystemClock.sleep(400);
            // 취소는 입력 초점을 복원하므로 IME가 다시 열린 상태일 수 있다.
            if(imeVisible()){instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);SystemClock.sleep(400);}
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);waitJs("document.body.innerText.includes('저장하지 않고 이동할까요?')");tap(button("이동하기"));waitJs("location.pathname!=='/habits/new'");
            tap(button("실천 추가"));tap("[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('습관 추가'))");tap(button("초안 복원"));waitJs(title+".value.includes("+JSONObject.quote(label)+")");record("04-draft-restored");
            tap("document.querySelector('.form-paper-footer button')");waitJs("location.pathname==='/'");

            tap(named("하루 일기"));keyboard("document.querySelector('textarea')");input("첫 줄: "+label+"\n둘째 줄: 한글 입력과 줄바꿈");footerVisible();record("05-diary-keyboard");
            tap(button("저장하기"));waitJs("location.pathname!=='/diary'");tap(named("하루 일기"));waitJs("document.querySelector('textarea').value.includes('둘째 줄: 한글 입력과 줄바꿈')");record("06-diary-restored");tap(named("뒤로 가기"));

            tap("[...document.querySelectorAll('[role=tab]')].find(b=>b.textContent.startsWith('신앙'))");tap(named("감사 기도 완료"));
            waitJs("!!document.querySelector('textarea[aria-label=\"기도 내용\"]')");keyboard(named("기도 내용"));input("메모 검증: "+label);
            waitJs("(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect(),v=visualViewport;return r.top>=v.offsetTop-1&&r.bottom<=v.offsetTop+v.height+2})()");record("07-memo-keyboard");
            tap(button("저장"));waitJs("!document.querySelector('textarea[aria-label=\"기도 내용\"]')");record("08-memo-saved");
        }
    }
}
