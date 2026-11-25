import React,{act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {BrowserRouter,Routes,Route} from 'react-router-dom'
import {beforeEach,afterEach,test,expect,vi} from 'vitest'
import PlanWorkspace from '../../../logs/sites/onju-web-mvp/web-mvp/src/PlanWorkspace'
import PlanApproval from '../../../logs/sites/onju-web-mvp/web-mvp/src/PlanApproval'
import {getAgentSessionId,resetAgentSession,withAgentSession} from '../../../logs/sites/onju-web-mvp/web-mvp/src/agentSession'
import {DEFAULT_REGIONAL_CONTEXT,saveRegionalContext,regionalDateKey} from '../../../logs/sites/onju-web-mvp/web-mvp/src/regionalContext'
import {applyWorkspaceCommand,emptyWorkspace,mondayIndex,addDays} from '../../../logs/sites/onju-web-mvp/supabase/functions/_shared/planWorkspace'
import {createJourneyBackend} from './backend.mjs'
import type {OnjuState} from '../../../logs/sites/onju-web-mvp/web-mvp/src/model'
import type {GoalCard} from '../../../logs/sites/onju-web-mvp/web-mvp/src/goalAgent'
import type {PlanWorkspace as WorkspaceState} from '../../../logs/sites/onju-web-mvp/supabase/functions/_shared/planWorkspace'
const mocks=vi.hoisted(()=>({invoke:vi.fn()}))
vi.mock('../../../logs/sites/onju-web-mvp/web-mvp/src/supabaseClient',()=>({supabase:{functions:{invoke:mocks.invoke}}}))
type StoredSession={card:GoalCard;workspace:WorkspaceState;workspaceRevision:number}
let backend:ReturnType<typeof createJourneyBackend>,root:Root,host:HTMLDivElement,stored:StoredSession,id:string,today:string
const state:OnjuState={approved:true,profile:{goal:'Read 3 books',reason:'Enjoy learning',obstacle:'',availableTime:'20 min',checkinTime:''},plan:[]}
beforeEach(async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});window.scrollTo=vi.fn()
  localStorage.clear();sessionStorage.clear();resetAgentSession();saveRegionalContext({...DEFAULT_REGIONAL_CONTEXT,locale:'en-US'})
  today=regionalDateKey(DEFAULT_REGIONAL_CONTEXT);id=getAgentSessionId();backend=createJourneyBackend()
  await backend.dispatch('onju-workspace',withAgentSession(id,{action:'load'}));stored=backend.sessions.get(id)
  stored.card={category:'기타',outcome:'Read 3 books',durationWeeks:4,baselineMetric:'0 books',targetMetric:'3 books',weeklyActions:[{title:'Read',frequencyPerWeek:1,durationMinutes:20,preferredDays:[mondayIndex(today)],planningStyle:'repeat'}],identity:'',deadline:'',cue:'',environment:'',tinyStart:'',fallbackAction:'',recoveryRule:'',reviewCycle:''}
  state.plan=[{id:crypto.randomUUID(),day:'Mon',dayIndex:mondayIndex(today),title:'Read for 20 minutes',planningStyle:'repeat',completionEvidence:'One note',fallback:'One page'}]
  stored.workspace=applyWorkspaceCommand(emptyWorkspace(),{id:crypto.randomUUID(),kind:'approve',today,start:today,end:addDays(today,27),source:'fixture-v1',newGoalId:crypto.randomUUID(),actionIds:[crypto.randomUUID()],snapshot:{profile:state.profile,plan:state.plan,goalCard:stored.card}})
  stored.workspaceRevision=1
  mocks.invoke.mockImplementation(async(name,{body})=>{try{return{data:structuredClone(await backend.dispatch(name,body)),error:null}}catch(error){return{data:null,error}}})
  host=document.createElement('div');document.body.append(host);root=createRoot(host)
})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals()})
async function wait(){await act(async()=>{await new Promise(r=>setTimeout(r,20))})}
async function until(f:()=>boolean){for(let i=0;i<100&&!f();i++)await wait();expect(f(),host.textContent?.slice(-3000)).toBe(true)}
const button=(name:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===name||b.getAttribute('aria-label')===name)!
async function click(name:string){await until(()=>!!button(name)&&!button(name).disabled);await act(async()=>button(name).click());await wait()}
async function render(path='/today'){window.history.replaceState({},'',path);await act(async()=>root.render(<BrowserRouter><Routes><Route path="/plans/:goalId" element={<PlanWorkspace state={state} onChange={()=>{}}/>}/><Route path="*" element={<PlanWorkspace state={state} onChange={()=>{}}/>}/></Routes></BrowserRouter>));await until(()=>!!host.querySelector('.workspace-actions'))}
async function route(path:string){await act(async()=>{window.history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'))});await wait()}
async function setValue(el:HTMLInputElement|HTMLTextAreaElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))})}
test('Today check/undo persists after remount; never calls AI or changes outcome',async()=>{
  await render();await click('Mark done');expect(Object.values(stored.workspace.entries)[0].status).toBe('done');expect(stored.workspace.outcomes).toHaveLength(0)
  await act(async()=>{root.unmount();root=createRoot(host)});await render();await until(()=>!!button('Undo completion'));await click('Undo completion')
  expect(Object.values(stored.workspace.entries)[0].status).toBe('unrecorded');expect(backend.requests.every(r=>r.name==='onju-workspace')).toBe(true)
})
test('save failure preserves note, no optimistic success; retry saves one record',async()=>{
  await render();const form=host.querySelector('.workspace-details form')!;const input=form.querySelector('textarea')!
  await setValue(input,'My note must survive');backend.failNextSave();await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await wait()
  expect(input.value).toBe('My note must survive');expect(Object.keys(stored.workspace.entries)).toHaveLength(0);expect(host.querySelector('[role=alert]')).not.toBeNull()
  await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await wait();expect(Object.values(stored.workspace.entries)[0].note).toBe('My note must survive')
})
test('stale tab cannot overwrite: reload then explicit retry, same input retained',async()=>{
  await render();stored.workspaceRevision++
  await click('Mark done');expect(host.querySelector('[role=alert]')?.textContent).toContain('Another tab');expect(Object.keys(stored.workspace.entries)).toHaveLength(0)
  await click('Reload latest records');await click('Mark done');expect(Object.values(stored.workspace.entries)[0].status).toBe('done')
})
test('goal detail records outcome separately and pause/resume keeps goal/history',async()=>{
  const goalId=stored.workspace.goals[0].id;await render('/plans/'+goalId)
  const form=host.querySelector('.workspace-outcome form')!
  await setValue(form.querySelector('textarea')!,'Finished the first book');await setValue(form.querySelector('input[name=value]')!,'1');await setValue(form.querySelector('input[name=target]')!,'3');await setValue(form.querySelector('input[name=unit]')!,'books')
  await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await wait()
  expect(stored.workspace.outcomes[0].value).toBe(1);expect(Object.keys(stored.workspace.entries)).toHaveLength(0)
  await click(' Pause');await route('/plans');expect(host.textContent).toContain('Paused');expect(stored.workspace.goals).toHaveLength(1)
})
test('approval never navigates on server failure; retry does not duplicate an approved draft',async()=>{
  stored.workspace=emptyWorkspace();stored.workspaceRevision=0;window.history.replaceState({},'','/plan')
  const approved=vi.fn();await act(async()=>root.render(<BrowserRouter><PlanApproval state={state} onApproved={approved}/></BrowserRouter>));await until(()=>!!button('Start with this plan')&&!button('Start with this plan').disabled)
  backend.failNextSave();await click('Start with this plan');expect(approved).not.toHaveBeenCalled();expect(window.location.pathname).toBe('/plan')
  await click('Start with this plan');expect(approved).toHaveBeenCalledTimes(1);expect(stored.workspace.goals).toHaveLength(1)
  await click('Start with this plan');expect(stored.workspace.goals).toHaveLength(1)
})
