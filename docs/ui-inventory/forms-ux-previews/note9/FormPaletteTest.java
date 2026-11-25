package com.onju.app;

import android.os.Build;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.WindowManager;
import androidx.test.core.app.ActivityScenario;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import static org.junit.Assert.*;

/** Isolated UI fixture only. Type through Android IME, never submit existing records. */
public class FormPaletteTest extends NativeInputFlowTest {
    final String marker="화면 입력 검증 "+System.currentTimeMillis();
    final LinkedHashSet<String> touchedDrafts=new LinkedHashSet<>();
    File folder(){File f=new File(activity.getExternalFilesDir(null),"form-evidence");f.mkdirs();return f;}
    void save(String name,String value)throws Exception{try(var out=new FileOutputStream(new File(folder(),name))){out.write(value.getBytes(StandardCharsets.UTF_8));}}
    String records()throws Exception{return js("JSON.stringify(Object.keys(localStorage).filter(k=>k.startsWith('fixture-db:')&&!k.endsWith(':user_settings')).sort().map(k=>[k,localStorage.getItem(k)]))");}
    String drafts()throws Exception{return js("Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('onju-draft:v1:')).sort().map(k=>[k,localStorage.getItem(k)]))");}
    void rememberDrafts()throws Exception{JSONObject current=new JSONObject(drafts());for(var it=current.keys();it.hasNext();){String key=it.next();if(current.getString(key).contains(marker))touchedDrafts.add(key);}save("test-draft-keys.json",new JSONArray(touchedDrafts).toString());}
    @Override void input(String text)throws Exception{
        int end=new JSONArray(js("[document.activeElement.value.length]")).getInt(0);
        AtomicReference<InputConnection> connection=new AtomicReference<>();instrumentation.runOnMainSync(()->connection.set(webView.onCreateInputConnection(new EditorInfo())));
        InputConnection c=connection.get();assertNotNull(c);CountDownLatch positioned=new CountDownLatch(1);
        Runnable move=()->{c.setSelection(end,end);positioned.countDown();};if(c.getHandler()!=null)c.getHandler().post(move);else instrumentation.runOnMainSync(move);
        assertTrue(positioned.await(5,TimeUnit.SECONDS));super.input(text);
    }
    void hideKeyboard()throws Exception{if(imeVisible()){instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);SystemClock.sleep(400);}assertFalse("Keyboard closes",imeVisible());}
    void acceptNativeLeave(){
        // The fixture's native document navigation can add a second beforeunload dialog.
        // Only accept its observed leave button after this test explicitly requests navigation.
        var root=instrumentation.getUiAutomation().getRootInActiveWindow();if(root==null)return;
        for(var node:root.findAccessibilityNodeInfosByText("이 페이지 닫기")){if(node.isClickable())node.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK);else if(node.getParent()!=null)node.getParent().performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK);}
    }
    @Override void go(String path,String ready)throws Exception{
        String url="https://localhost"+path;instrumentation.runOnMainSync(()->webView.loadUrl(url));
        SystemClock.sleep(600);long until=SystemClock.uptimeMillis()+15000;boolean loaded=false;
        while(SystemClock.uptimeMillis()<until){acceptNativeLeave();AtomicReference<Boolean> done=new AtomicReference<>(false);instrumentation.runOnMainSync(()->done.set(webView.getProgress()==100&&url.equals(webView.getUrl())));if(done.get()){loaded=true;break;}SystemClock.sleep(150);}
        assertTrue("Native document loaded: "+path,loaded);SystemClock.sleep(350);waitJs("location.pathname==="+JSONObject.quote(path)+"&&("+ready+")");
    }
    void leaveEditor()throws Exception{
        hideKeyboard();
        String close="document.querySelector('.memo-editor-header button')||document.querySelector('[aria-label=\"뒤로 가기\"]')";
        if(!"true".equals(js("!!("+close+")")))return;
        tap(close);SystemClock.sleep(400);acceptNativeLeave();SystemClock.sleep(200);
        if("true".equals(js("document.body.innerText.includes('저장하지 않고 이동할까요?')"))){tap(button("이동하기"));SystemClock.sleep(400);acceptNativeLeave();SystemClock.sleep(250);}
        waitJs("!document.querySelector('.memo-editor-sheet')&&!document.body.innerText.includes('저장하지 않고 이동할까요?')");
    }
    void restoreDraft()throws Exception{if("true".equals(js("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='초안 복원')"))){tap(button("초안 복원"));SystemClock.sleep(250);}}
    void capture(String name)throws Exception{
        SystemClock.sleep(350);
        var image=instrumentation.getUiAutomation().takeScreenshot();
        try(var out=new FileOutputStream(new File(folder(),name+".png"))){image.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}
    }
    void measure(String name,String field,boolean sheet)throws Exception{
        String footer=sheet?".memo-editor-actions":".form-paper-footer";
        waitJs("(()=>{const r=document.querySelector('"+footer+"').getBoundingClientRect(),v=visualViewport;return r.top>=v.offsetTop&&r.bottom<=v.offsetTop+v.height+2})()");
        JSONObject m=new JSONObject(js("(()=>{const e=("+field+"),s=getComputedStyle(document.documentElement),r=e.getBoundingClientRect(),f=document.querySelector('"+footer+"').getBoundingClientRect(),v=visualViewport,c=n=>{const x=document.createElement('canvas').getContext('2d');x.fillStyle=s.getPropertyValue(n).trim();return x.fillStyle.toUpperCase()};return {name:"+JSONObject.quote(name)+",width:innerWidth,height:innerHeight,viewportHeight:v.height,fieldTop:r.top,fieldBottom:r.bottom,footerTop:f.top,footerBottom:f.bottom,fontSize:parseFloat(getComputedStyle(e).fontSize),overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,primary:c('--color-primary'),accent:c('--color-accent'),surface:c('--color-surface'),canvas:c('--color-surface-alt')}})()"));
        m.put("keyboard",imeVisible());evidence.put(m);save("measurements.json",evidence.toString(2));capture(name);
        assertTrue("Real keyboard: "+name,imeVisible());assertEquals(0,m.getInt("overflow"));
        assertTrue("Readable input: "+name,m.getDouble("fontSize")>=16);
        assertTrue("Input not behind footer: "+name+" "+m,m.getDouble("fieldBottom")<=m.getDouble("footerTop")+2);
        assertTrue("Input visible: "+name,m.getDouble("fieldBottom")>0);
        assertEquals("#1F4D3A",m.getString("primary"));assertEquals("#F0876E",m.getString("accent"));assertEquals("#F3EADF",m.getString("surface"));assertEquals("#FAF0E6",m.getString("canvas"));
    }
    void form(String route,String fieldLabel,String name,String text)throws Exception{
        String field=named(fieldLabel);go(route,"!!("+field+")");restoreDraft();keyboard(field);input(text);
        waitJs(field+".value.includes("+JSONObject.quote(marker)+")");rememberDrafts();measure(name,field,false);
        hideKeyboard();waitJs("location.pathname==="+JSONObject.quote(route));
        leaveEditor();go(route,"!!("+field+")");waitJs("document.body.innerText.includes('초안 복원')");restoreDraft();
        waitJs(field+".value.includes("+JSONObject.quote(marker)+")");hideKeyboard();leaveEditor();
    }
    void memo(String kind,String name)throws Exception{
        go("/","!!document.querySelector('.home-growth-summary')");
        // New test draft only; no routine, log, completion or saved memo is changed.
        String doc=new JSONArray(js("(()=>{const owner=JSON.parse(localStorage.getItem('fixture-session')).user.id,d=new Date(),date=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),document='faith:'+crypto.randomUUID()+':'+date+':"+kind+"',values="+(kind.equals("bible")?"{book:'빌립보서',chapter:4,verse:13,reflection:"+JSONObject.quote(marker)+"}":"{category:'개인',content:"+JSONObject.quote(marker)+"}")+";localStorage.setItem('onju-draft:v1:'+encodeURIComponent(owner)+':'+encodeURIComponent(document),JSON.stringify({version:1,owner,document,savedAt:new Date().toISOString(),values}));return [document]})()")).getString(0);
        rememberDrafts();
        String index="Object.keys(localStorage).filter(k=>k.startsWith('onju-draft:v1:'+encodeURIComponent(JSON.parse(localStorage.getItem('fixture-session')).user.id)+':faith%3A')).map(k=>JSON.parse(localStorage.getItem(k)).document).indexOf("+JSONObject.quote(doc)+")";
        String open="document.querySelector('.records-paper details').querySelectorAll('button')["+index+"]";
        go("/faith-notes","!!document.querySelector('.records-paper details')");tap("document.querySelector('.records-paper details summary')");tap(open);
        waitJs("!!document.querySelector('.memo-editor-sheet')");restoreDraft();
        String field=named(kind.equals("bible")?"말씀 묵상":"기도 내용");keyboard(field);input("\n키보드 위에서 차분하게 기록합니다.");measure(name,field,true);
        hideKeyboard();tap(named(kind.equals("bible")?"말씀 기록 닫기":"기도 메모 닫기"));
        waitJs("document.body.innerText.includes('저장하지 않고 이동할까요?')");tap(button("취소"));
        waitJs(field+".value.includes("+JSONObject.quote(marker)+")");hideKeyboard();
        if(kind.equals("bible")){keyboard(named("장"));measure("06-bible-number-keyboard",named("장"),true);hideKeyboard();}
        leaveEditor();go("/faith-notes","!!document.querySelector('.records-paper details')");tap("document.querySelector('.records-paper details summary')");tap(open);
        waitJs("!!document.querySelector('.memo-editor-sheet')&&[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='초안 복원')");restoreDraft();
        waitJs("!document.querySelector('.memo-editor-sheet fieldset').disabled");
        waitJs(field+".value.includes('차분하게 기록합니다')");capture(name+"-restored");
        leaveEditor();
    }
    @Test public void keyboardPaletteAndDrafts()throws Exception{
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(a->{activity=a;webView=a.getBridge().getWebView();a.setTurnScreenOn(true);a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);});
            waitJs("innerWidth>0&&document.querySelector('#root')?.childElementCount>0");go("/","!!document.querySelector('.home-growth-summary')");
            // All pre-task drafts were absent (attempt-1/draft-backup.json). Recover exact prior test markers only.
            js("(()=>{const markers=['1793250869710','1793251126539','1793251329906','1793251483657'];for(const k of Object.keys(localStorage).filter(k=>k.startsWith('onju-draft:v1:'))){if(markers.some(m=>localStorage.getItem(k).includes('화면 입력 검증 '+m)))localStorage.removeItem(k)}return true})()");
            js("(()=>{const k='onju-draft:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:faith%3Abdeb9971-b9c3-44f8-a536-98a37447ce6a%3A2026-10-29%3Aprayer',raw=localStorage.getItem(k);if(raw&&raw.includes('화면 입력 검증 17932511')&&raw.includes('차분하게 기록합니다.26539'))localStorage.removeItem(k);return true})()");
            SystemClock.sleep(2500);
            String before=records(),draftBefore=drafts(),theme=js("localStorage.getItem('theme-store')"),settings=js("localStorage.getItem('settings-store')");save("draft-backup.json",draftBefore);save("records-before.json",before);
            save("test-marker.txt",marker);
            boolean passed=false;
            try{
                form("/habits/new","습관 이름","01-habit-keyboard",marker);
                form("/goals/monthly/new","되고 싶은 모습","02-goal-keyboard",marker+"\n작은 실천을 이어가는 사람");
                form("/diary","오늘 하루 기록","03-diary-keyboard",marker+"\n첫 줄과 둘째 줄을 이어 적어요.");
                memo("prayer","04-prayer-keyboard");memo("bible","05-bible-keyboard");
                passed=true;
            }catch(Exception|AssertionError problem){save("failure.txt",problem.toString());capture("failure");throw problem;}finally{
                leaveEditor();go("/","!!document.querySelector('.home-growth-summary')");
                // Restore only the draft keys this test touched, even if editing splits the marker text.
                js("(()=>{const before="+draftBefore+";for(const k of "+new JSONArray(touchedDrafts)+"){if(Object.hasOwn(before,k))localStorage.setItem(k,before[k]);else localStorage.removeItem(k)}return true})()");
                SystemClock.sleep(3000);go("/","!!document.querySelector('.home-growth-summary')");
                assertEquals("Saved records unchanged",before,records());assertEquals("Original drafts restored",draftBefore,drafts());
                assertEquals(theme,js("localStorage.getItem('theme-store')"));assertEquals(settings,js("localStorage.getItem('settings-store')"));
                save("results.json",new JSONObject().put("model",Build.MODEL).put("android",Build.VERSION.RELEASE).put("passed",passed).put("fixtureOnly",true).put("recordsPreserved",true).put("draftsPreserved",true).put("checks",evidence).toString(2));
            }
        }
    }
    @Test public void verifyPreservedAfterRestart()throws Exception{
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(a->{activity=a;webView=a.getBridge().getWebView();a.setTurnScreenOn(true);a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);});
            waitJs("innerWidth>0&&document.querySelector('#root')?.childElementCount>0");go("/","!!document.querySelector('.home-growth-summary')");
            assertEquals(new String(java.nio.file.Files.readAllBytes(new File(folder(),"records-before.json").toPath()),StandardCharsets.UTF_8),records());
            assertEquals(new String(java.nio.file.Files.readAllBytes(new File(folder(),"draft-backup.json").toPath()),StandardCharsets.UTF_8),drafts());
            save("restart-preservation.json",new JSONObject().put("recordsPreserved",true).put("draftsPreserved",true).put("afterProcessRestart",true).toString(2));
        }
    }
}
