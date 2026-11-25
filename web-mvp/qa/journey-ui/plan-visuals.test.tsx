import React,{act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {beforeEach,afterEach,expect,test,vi} from 'vitest'
import CoachingPlanView from '../../../logs/sites/onju-web-mvp/web-mvp/src/CoachingPlanView'
import {actionTimeline,presentationActions} from '../../../logs/sites/onju-web-mvp/web-mvp/src/planPresentation'
import {domainFixture,domainSamples} from '../../../logs/sites/onju-web-mvp/web-mvp/qa/domain-plan-fixtures'
import {DEFAULT_REGIONAL_CONTEXT,saveRegionalContext} from '../../../logs/sites/onju-web-mvp/web-mvp/src/regionalContext'
let root:Root,host:HTMLDivElement
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);localStorage.clear();saveRegionalContext(DEFAULT_REGIONAL_CONTEXT);host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals()})
const click=async(label:string)=>{const button=[...host.querySelectorAll('button')].find(b=>b.textContent===label);expect(button).toBeTruthy();await act(async()=>button!.click())}
test('elapsed flow uses only explicit step times, retains full text and makes no network requests',async()=>{
  const network=vi.fn(()=>{throw Error('Network forbidden in UI test')});vi.stubGlobal('fetch',network)
  const plan=domainFixture(domainSamples[1],true),original=JSON.stringify(plan)
  await act(async()=>root.render(<CoachingPlanView card={plan}/>))
  expect([...host.querySelectorAll('.plan-flow .plan-step-meta b')].map(e=>e.textContent)).toEqual(['0–3분','3–12분','12–15분'])
  expect(host.textContent).toContain('단계 합계 15분')
  expect(host.textContent).toContain('실제 시작 시각이나 완료 기록은 아니에요')
  expect(host.querySelectorAll('[role=progressbar]')).toHaveLength(0)
  await click('전체 설명 펼치기')
  for(const text of plan.execution!.actions[0].steps!)expect(host.textContent).toContain(text)
  expect(host.textContent).toContain('새 AI 이미지 생성은 현재 꺼져 있어요')
  await click('단계별 보기');await click('표로 보기');await click('한눈에 보기')
  expect(JSON.stringify(plan)).toBe(original);expect(network).not.toHaveBeenCalled()
})
test('missing step durations remove the total/ranges but keep explicit partial durations',async()=>{
  const plan=domainFixture(domainSamples[4],true);plan.execution!.actions[0].stepMinutes=[3]
  await act(async()=>root.render(<CoachingPlanView card={plan}/>))
  expect(host.querySelector('.plan-time-composition')).toBeNull()
  expect([...host.querySelectorAll('.plan-flow .plan-step-meta b')].map(e=>e.textContent)).toEqual(['예상 3분'])
  expect(actionTimeline(presentationActions(plan)[0])).toBeUndefined()
})
test('disagreed totals are flagged, never silently fitted; non-finite totals are not drawn',async()=>{
  const plan=domainFixture(domainSamples[0],true);plan.weeklyActions[0].durationMinutes=20
  await act(async()=>root.render(<CoachingPlanView card={plan}/>))
  expect(host.textContent).toContain('단계 합계 15분');expect(host.querySelector('.plan-time-mismatch')).not.toBeNull()
  const action=presentationActions(plan)[0];action.steps.forEach(step=>step.minutes=Number.MAX_VALUE)
  expect(actionTimeline(action)).toBeUndefined()
})
test('single steps and legacy plans remain readable without manufacturing a flow',async()=>{
  const plan=domainFixture(domainSamples[0]);plan.execution!.actions[0].steps=['현재 결과를 저장한다.']
  await act(async()=>root.render(<CoachingPlanView card={plan}/>))
  expect(host.querySelector('.plan-flow')).toBeNull();expect(host.textContent).toContain('현재 결과를 저장한다.')
  delete plan.execution;await act(async()=>root.render(<CoachingPlanView card={plan}/>))
  expect(host.querySelector('.plan-flow')).toBeNull();expect(host.textContent).toContain('세부 순서가 아직 없는 계획')
})
test('English controls and elapsed-time warnings do not translate the original plan',async()=>{
  saveRegionalContext({...DEFAULT_REGIONAL_CONTEXT,locale:'en-US'})
  await act(async()=>root.render(<CoachingPlanView card={domainFixture(domainSamples[2],true)}/>))
  expect(host.textContent).toContain('Elapsed time from the start')
  expect(host.textContent).toContain(domainSamples[2].steps[1])
  await click('Table view');await click('Overview')
  expect(host.querySelector('.plan-flow')?.getAttribute('aria-label')).toBe('Timed action flow')
})
