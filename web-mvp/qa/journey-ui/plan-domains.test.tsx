import React,{act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {beforeEach,afterEach,expect,test,vi} from 'vitest'
import CoachingPlanView,{emphasizeStep} from '../../../logs/sites/onju-web-mvp/web-mvp/src/CoachingPlanView'
import {planDomain,presentationActions,explicitTrackingExample} from '../../../logs/sites/onju-web-mvp/web-mvp/src/planPresentation'
import {planReferences} from '../../../logs/sites/onju-web-mvp/web-mvp/src/planReferenceRegistry'
import {domainSamples,domainFixture} from '../../../logs/sites/onju-web-mvp/web-mvp/qa/domain-plan-fixtures'
import {DEFAULT_REGIONAL_CONTEXT,saveRegionalContext} from '../../../logs/sites/onju-web-mvp/web-mvp/src/regionalContext'
let root:Root,host:HTMLDivElement
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);localStorage.clear();saveRegionalContext(DEFAULT_REGIONAL_CONTEXT);host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals()})
const click=async(label:string)=>{const el=[...host.querySelectorAll('button')].find(b=>b.textContent===label);expect(el).toBeTruthy();await act(async()=>el!.click())}
test.each(domainSamples)('$category supports steps, tables, completion and source examples without plan mutations',async(sample)=>{
  const card=domainFixture(sample),original=JSON.stringify(card)
  await act(async()=>root.render(<CoachingPlanView card={card}/>))
  expect(host.querySelectorAll('.plan-flow>li')).toHaveLength(3)
  expect(host.querySelector('.plan-action-outcomes')?.textContent).toContain(sample.criterion)
  expect(host.querySelector('.plan-record-example')?.textContent).toContain(sample.example)
  expect(host.querySelector('.plan-record-example')?.textContent).toContain('실제 완료 기록은 아니에요')
  expect(host.querySelector('.exercise-help')).toBeNull()
  await click('표로 보기');expect(host.querySelectorAll('tbody tr')).toHaveLength(3);expect(host.querySelectorAll('thead th')).toHaveLength(2)
  expect(host.querySelector('thead')?.textContent).toContain(planDomain(sample.category).actionLabel)
  await click('전체 설명 펼치기')
  for(const step of sample.steps)expect(host.textContent).toContain(step)
  for(const detail of Object.values(card.execution!.coachingGuide!))expect(host.textContent).toContain(detail)
  await click('단계별 보기');expect(host.querySelectorAll('.plan-step-cards>li')).toHaveLength(3)
  expect(JSON.stringify(card)).toBe(original)
})
test('presentation follows available content, not category, and never guesses unspecified time',async()=>{
  const card=domainFixture(domainSamples[1],true)
  expect(presentationActions(card)[0].suggestedLayout).toBe('overview')
  await act(async()=>root.render(<CoachingPlanView card={card}/>));expect(host.querySelector('.plan-time-composition')).not.toBeNull()
  await click('표로 보기');expect(host.querySelectorAll('thead th')).toHaveLength(3)
  expect([...host.querySelectorAll('tbody td:last-child b')].map(el=>el.textContent)).toEqual(['3','9','3'])
  card.execution!.actions[0].stepMinutes=[3,NaN,-1]
  expect(presentationActions(card)[0].suggestedLayout).toBe('overview')
  expect(presentationActions(card)[0].steps.map(step=>step.minutes)).toEqual([3,undefined,undefined])
})
test('references only expose explicit source content; no invented example or unsupported image',()=>{
  expect(explicitTrackingExample('마친 내용을 기록한다.')).toBeUndefined()
  expect(explicitTrackingExample('Example: read 4 pages / one question')).toBe('read 4 pages / one question')
  expect(explicitTrackingExample('기록 예시: 초안 1개')).toBe('초안 1개')
  expect(planReferences({actionText:'밴드 루마니안 데드리프트',tracking:'성과를 기록한다.'})).toEqual([])
  expect(planReferences({actionText:'버드독 8회',tracking:'예: 8회 / 편안함'}).map(r=>r.kind)).toEqual(['exercise','plan-example'])
  expect(emphasizeStep('단어 10개와 2문장, read 4 pages')).toBe('단어 **10개**와 **2문장**, read **4 pages**')
})
test('English view controls and examples remain separate from Korean source content',async()=>{
  saveRegionalContext({...DEFAULT_REGIONAL_CONTEXT,locale:'en-US'})
  await act(async()=>root.render(<CoachingPlanView card={domainFixture(domainSamples[0])}/>))
  expect(host.textContent).toContain('Example record');expect(host.textContent).toContain(domainSamples[0].steps[0])
  await click('Table view');expect(host.querySelector('thead')?.textContent).toContain('Work to do')
  expect(host.textContent).toContain(domainSamples[0].criterion)
})
