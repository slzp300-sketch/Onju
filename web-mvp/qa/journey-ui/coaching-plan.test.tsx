import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import CoachingPlanView, { emphasizeStep, stepPreview } from '../../../logs/sites/onju-web-mvp/web-mvp/src/CoachingPlanView'
import ExerciseGuidePanel from '../../../logs/sites/onju-web-mvp/web-mvp/src/ExerciseGuidePanel'
import { exerciseGuides, findExerciseGuides } from '../../../logs/sites/onju-web-mvp/web-mvp/src/exerciseGuides'
import { emptyGoalCard, type GoalCard } from '../../../logs/sites/onju-web-mvp/web-mvp/src/goalAgent'
import { saveRegionalContext, DEFAULT_REGIONAL_CONTEXT } from '../../../logs/sites/onju-web-mvp/web-mvp/src/regionalContext'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

let root: Root, host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear(); saveRegionalContext(DEFAULT_REGIONAL_CONTEXT)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
const click = async (label: string) => { const el = [...host.querySelectorAll('button')].find(b => b.textContent === label || b.getAttribute('aria-label') === label); expect(el).toBeTruthy(); await act(async () => el!.click()) }
const card = (): GoalCard => ({ ...structuredClone(emptyGoalCard), outcome:'근력 기르기', weeklyActions:[{title:'전신 A',durationMinutes:20,frequencyPerWeek:3,preferredDays:[1,3,5]}], execution:{progressStrategy:'개인별 진행 전략', actions:[{steps:['턱걸이 4세트를 한다. 이어 인버티드 로우 3세트 12~15회를 한다. 충분히 회복한 뒤 진행한다.','마운틴 클라이머 30초와 제자리 걷기 30초를 6라운드 반복한다.'], stepMinutes:[14,6], timedRepeats:[{stepIndex:1,rounds:6,segmentSeconds:[30,30],restSeconds:0,restPlacement:'none'}], conditionalRules:['통증이 생기면 멈춘다.'],goalResult:'근력 향상',completionCriterion:'기록',minimumAction:'준비',minimumMinutes:1}], coachingGuide:{rationale:'이유 원문',progression:'진행 원문',tracking:'기록 원문',adjustment:'조정 원문',recovery:'복귀 원문'},contextNotes:['추가 설명 원문'] } } as GoalCard)

test('all original instructions, timing, safety and management remain without changing the saved card', async () => {
  const plan = card(), before = JSON.stringify(plan)
  await act(async () => root.render(<CoachingPlanView card={plan}/>))
  expect(host.querySelectorAll('.plan-flow>li')).toHaveLength(2)
  await click('표로 보기'); expect(host.querySelectorAll('tbody tr')).toHaveLength(2)
  expect(host.querySelector('.coaching-safety')?.closest('details')).toBeNull()
  expect(host.querySelector('.coaching-safety')?.textContent).toContain('통증이 생기면 멈춘다.')
  expect(host.querySelectorAll('details[open]')).toHaveLength(0)
  for(const step of plan.execution!.actions[0].steps!) expect(host.textContent).toContain(step)
  for(const value of Object.values(plan.execution!.coachingGuide!)) expect(host.textContent).toContain(value)
  expect(host.textContent).toContain('개인별 진행 전략'); expect(host.textContent).toContain('추가 설명 원문')
  expect(host.textContent).toContain('(30 + 30)초 × 6 = 6분')
  await click('전체 설명 펼치기')
  expect(host.querySelectorAll('details[open]').length).toBe(host.querySelectorAll('details').length)
  await click('설명 접기'); expect(host.querySelectorAll('details[open]')).toHaveLength(0)
  expect(JSON.stringify(plan)).toBe(before)
})
test('preview keeps two action sentences and highlights quantities without double-formatting existing emphasis', () => {
  expect(stepPreview('첫 동작. 둘째 동작. 자세 설명.').text).toBe('첫 동작.\n\n둘째 동작.')
  expect(emphasizeStep('**턱걸이 4세트**와 12~15회')).toBe('**턱걸이 4세트**와 **12~15회**')
  expect(stepPreview('1.5분 실행 후 쉬기').text).toBe('1.5분 실행 후 쉬기')
})
test('only supported exercises resolve; modifiers never silently become another exercise', () => {
  expect(findExerciseGuides('턱걸이 4세트. 밴드 루마니안 데드리프트 3세트. 버드독').map(g=>g.id)).toEqual(['pullup','bird-dog'])
  for (const text of ['밴드 보조 턱걸이','네거티브 풀업','사이드 플랭크','플랭크 숄더탭','무릎 푸시업','링 인버티드 로우','weighted deadlift','스쿼트 점프','출장 보고서 작성']) expect(findExerciseGuides(text),text).toEqual([])
  expect(findExerciseGuides('턱걸이. 턱걸이.')).toHaveLength(1)
  expect(findExerciseGuides('Bulgarian split squat; dead bug; bird dog; plank')).toHaveLength(4)
})
test('photos load only on selection, show variation, sources, accessible alt text and a useful error state', async () => {
  await act(async()=>root.render(<ExerciseGuidePanel text="불가리안 스플릿 스쿼트 3세트. 버드독 8회"/>))
  expect(host.querySelectorAll('img')).toHaveLength(0)
  await click('불가리안 스플릿 스쿼트')
  expect(host.querySelectorAll('img')).toHaveLength(2)
  expect(host.textContent).toContain('덤벨을 든 변형')
  expect(host.querySelector('img')?.alt).toContain('준비 자세')
  expect(host.querySelector('img')?.getAttribute('src')).toMatch(/^\/exercise-guide\//)
  await act(async()=>host.querySelector('img')!.dispatchEvent(new Event('error')))
  expect(host.querySelector('[role=status]')?.textContent).toContain('불러오지 못했어요')
  await click('버드독'); expect(host.querySelectorAll('img')).toHaveLength(1)
  expect(host.textContent).toContain('CC BY 2.0'); expect(host.textContent).toContain('PTPioneer')
  await click('사진 안내 닫기'); expect(host.querySelectorAll('img')).toHaveLength(0)
})
test('unknown and non-exercise plans keep full instructions without wrong photos or invented times', async () => {
  const plan = card(); plan.execution!.actions[0].steps=['처음 보는 동작을 연습해요.','결과를 기록해요.']; delete plan.execution!.actions[0].stepMinutes; delete plan.execution!.actions[0].timedRepeats
  await act(async()=>root.render(<CoachingPlanView card={plan}/>))
  expect(host.querySelector('.exercise-help')).toBeNull(); expect(host.textContent).toContain('처음 보는 동작을 연습해요.')
  expect(host.querySelectorAll('.plan-flow>li')).toHaveLength(2)
  expect(host.querySelector('.plan-step-meta b')).toBeNull()
  await click('표로 보기'); expect(host.querySelectorAll('thead th')).toHaveLength(2)
  delete plan.execution; await act(async()=>root.render(<CoachingPlanView card={plan}/>))
  expect(host.textContent).toContain('세부 순서가 아직 없는 계획')
  expect(host.textContent).toContain('전신 A')
})
test('English UI translates helper labels without translating user-authored plan content', async () => {
  saveRegionalContext({...DEFAULT_REGIONAL_CONTEXT,locale:'en-US'})
  await act(async()=>root.render(<CoachingPlanView card={card()}/>))
  expect(host.textContent).toContain('What to do, and how much'); expect(host.textContent).toContain('충분히 회복한 뒤 진행한다.')
  await click('Pull-up'); expect(host.textContent).toContain('wide grip'); expect(host.textContent).not.toContain('모르는 동작')
})
test('all catalog images and credits exist locally and match source hashes', () => {
  const dir=resolve('logs/sites/onju-web-mvp/web-mvp/public/exercise-guide')
  const manifest=JSON.parse(readFileSync(resolve(dir,'sources.json'),'utf8'))
  const bird=JSON.parse(readFileSync(resolve(dir,'bird-dog-source.json'),'utf8'))
  for(const guide of exerciseGuides) { expect(guide.files.length).toBe(guide.captions.length); for(const file of guide.files) {
    expect(existsSync(resolve(dir,file)),file).toBe(true)
    const entry=[...manifest.images,bird].find(item=>item.file===file)
    expect(createHash('sha256').update(readFileSync(resolve(dir,file))).digest('hex')).toBe(entry.sha256)
  }}
})
