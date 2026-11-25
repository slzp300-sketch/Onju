import React,{act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {beforeEach,afterEach,expect,test,vi} from 'vitest'
import App from '../../../logs/sites/onju-web-mvp/web-mvp/src/App'
import {DEFAULT_REGIONAL_CONTEXT,saveRegionalContext} from '../../../logs/sites/onju-web-mvp/web-mvp/src/regionalContext'
import {getAgentSessionId,resetAgentSession} from '../../../logs/sites/onju-web-mvp/web-mvp/src/agentSession'
import {exportCurrentSession} from '../../../logs/sites/onju-web-mvp/web-mvp/src/dataControlsApi'
import {createJourneyBackend} from './backend.mjs'
const mocks=vi.hoisted(()=>({invoke:vi.fn()}))
vi.mock('../../../logs/sites/onju-web-mvp/web-mvp/src/supabaseClient',()=>({supabase:{functions:{invoke:mocks.invoke}}}))
let backend:ReturnType<typeof createJourneyBackend>,root:Root,host:HTMLDivElement
beforeEach(()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}})
  HTMLElement.prototype.scrollTo=vi.fn();HTMLElement.prototype.scrollIntoView=vi.fn()
  localStorage.clear();sessionStorage.clear();resetAgentSession()
  backend=createJourneyBackend()
  vi.stubGlobal('fetch',vi.fn((url,init)=>backend.fetch(url,init)))
  mocks.invoke.mockImplementation(async(name,{body})=>{try{return{data:structuredClone(await backend.dispatch(name,body)),error:null}}catch(error){return{data:null,error}}})
  host=document.createElement('div');document.body.append(host);root=createRoot(host)
})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals()})
const wait=async()=>{await act(async()=>{await new Promise(done=>setTimeout(done,25))})}
async function until(check:()=>boolean){for(let i=0;i<150&&!check();i++)await wait();expect(check(),host.textContent?.slice(-5000)).toBe(true)}
const button=(re:RegExp)=>[...host.querySelectorAll('button')].find(b=>re.test((b.textContent??'')+' '+b.getAttribute('aria-label')))
async function click(re:RegExp){await until(()=>Boolean(button(re)&&!button(re)!.disabled));await act(async()=>button(re)!.click());await wait()}
async function full(){const b=button(/전체 답변 보기|Show full/);if(b)await act(async()=>b.click())}
async function route(path:string){await act(async()=>{window.history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'))});await wait()}
async function start(ko:boolean){
  saveRegionalContext({...DEFAULT_REGIONAL_CONTEXT,locale:ko?'ko-KR':'en-US',timeZone:ko?'Asia/Seoul':'America/Los_Angeles',weekStartsOn:ko?1:0})
  window.history.replaceState({},'','/')
  await act(async()=>root.render(<App/>));await route('/setup')
  await until(()=>!!host.querySelector('input[type=checkbox]'))
  await act(async()=>(host.querySelector('input[type=checkbox]') as HTMLInputElement).click())
  await click(/온주와 대화 시작|Start talking with Onju/)
  await until(()=>!!host.querySelector('textarea'))
}
async function send(text:string){
  const input=host.querySelector('textarea')!
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}))})
  await act(async()=>input.parentElement!.querySelector('button')!.click());await wait();await full()
}
for(const ko of [true,false]) test(`${ko?'KR':'EN'} real UI: first visit → questions → explicit draft → saved plan → daily → revisit → export/delete`,async()=>{
  await start(ko)
  await send(ko?'책 3권 읽고 싶어':'I want to read 3 books')
  expect(button(/첫 주 실행안 만들기|Build the first week/i)).toBeUndefined()
  await send(ko?'12주, 현재 0권이야. 평일 20분 가능하고 주말은 유동적이야':'12 weeks, 0 books completed, 20 minutes on weekdays; weekends vary')
  if(!ko) { expect(host.querySelector('.goal-draft')?.textContent).not.toMatch(/[가-힣]/);expect(host.querySelector('.goal-draft')?.textContent).toContain('3 times per week') }
  await click(/이 초안으로 시작할게요|Start with this draft/);await full()
  await click(/이 목표로 첫 주 실행안 만들기|Build the first week/i)
  await until(()=>window.location.pathname==='/plan')
  expect(host.querySelector('.revision-preview')).toBeNull()
  expect(host.querySelector('#artifact-upgrade-title')).toBeNull()
  if(!ko) {
    expect(host.textContent).not.toMatch(/[가-힣]/)
    expect([...host.querySelectorAll('[aria-label]')].map(el=>el.getAttribute('aria-label')).join(' ')).not.toMatch(/[가-힣]/)
  }
  expect(host.querySelectorAll('textarea.plan-action-title')).toHaveLength(3)
  const id=getAgentSessionId(),stored=backend.sessions.get(id)
  expect(stored.plan).toHaveLength(3);expect(stored.card.baselineMetric).toBe(ko?'현재 0권':'0 books completed')
  expect(stored.card.durationWeeks).toBe(12)
  expect(backend.requests.filter(r=>r.name.startsWith('onju-plan-agent'))).toHaveLength(1)
  await click(/이 계획으로 시작하기|Start with this plan/)
  await until(()=>window.location.pathname==='/today')
  await until(()=>!!host.querySelector('.workspace-heading'))
  expect(stored.workspace.goals).toHaveLength(1)
  await route('/check-in')
  await click(/아침 점검|Morning check/);await click(ko?/^괜찮아요/:/^Good/)
  await until(()=>stored.checkIns[0]?.status==='completed')
  await act(async()=>{root.unmount();root=createRoot(host);root.render(<App/>)})
  await until(()=>!!button(/아침 점검|Morning check/))
  if(!ko)expect(host.textContent).not.toMatch(/[가-힣]/)
  expect(getAgentSessionId()).toBe(id);expect(stored.plan).toHaveLength(3)
  const exported=await exportCurrentSession(id)
  expect(JSON.stringify(exported)).toContain(stored.card.outcome)
  expect(JSON.stringify(exported)).not.toContain(stored.token)
  await route('/data');await click(/삭제 범위 확인|Review deletion/)
  await act(async()=>(host.querySelector('input[type=checkbox]') as HTMLInputElement).click())
  await click(/확인, 현재 대화 삭제|Confirm deletion/)
  await until(()=>stored.deleted===true)
  expect(localStorage.getItem('onju-web-alpha:'+id)).toBeNull()
  expect(backend.requests.every(r=>r.body.sessionId===id)).toBe(true)
})
test('slow response + double send + budget retry keep a single user turn and original request id',async()=>{
  await start(false);backend.failNextChat();const release=backend.holdChat()
  await send('I want to read 3 books')
  const sendButton=host.querySelector('textarea')!.parentElement!.querySelector('button')!
  await act(async()=>{sendButton.click();sendButton.click()})
  expect(backend.requests.filter(r=>r.name==='onju-agent-v2')).toHaveLength(1)
  await act(async()=>release());await until(()=>!!button(/Try again|Retry/))
  await click(/Try again|Retry/);await full()
  const calls=backend.requests.filter(r=>r.name==='onju-agent-v2')
  expect(calls).toHaveLength(2);expect(calls[0].body.turnId).toBeTruthy();expect(calls[0].body).toEqual(calls[1].body)
  expect(host.querySelectorAll('.user-bubble')).toHaveLength(1)
})
test('failed plan save cannot navigate to approval or pretend to be saved',async()=>{
  await start(false);await send('I want to read 3 books');await send('12 weeks; 0 books; 20 minutes weekdays; flexible weekends')
  await click(/Start with this draft/);await full();backend.failNextSave()
  await click(/Build the first week/i)
  expect(window.location.pathname).toBe('/setup')
  expect(backend.sessions.get(getAgentSessionId()).plan).toHaveLength(0)
  await click(/Build the first week/i);await until(()=>window.location.pathname==='/plan')
  expect(backend.sessions.get(getAgentSessionId()).plan).toHaveLength(3)
})
