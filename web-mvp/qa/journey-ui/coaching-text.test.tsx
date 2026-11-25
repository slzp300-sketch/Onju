import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import AgentText from '../../../logs/sites/onju-web-mvp/web-mvp/src/AgentText'
import { formatReply } from '../../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/state'
import { initialGoalMessage } from '../../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalExecution'
import { emptyGoal, materializeGoalDraft } from '../../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goal'
import { loadState } from '../../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent'
import { withCoachingDetails } from '../../../logs/sites/onju-web-mvp/web-mvp/scripts/fixtures/coaching-plan.mjs'

test('real message renderer preserves detailed sections, emphasis and ordered steps', () => {
  const text = formatReply({ paragraphs: ['## 진행 방향\n\n**집에서 가능한 방법**으로 정리해요.', '### 실행 방법\n\n1. 준비할 것을 확인해요.\n2. 정한 행동을 해요.\n3. 결과를 남겨요.'], bullets: [], question: '사용할 도구가 있나요?\n피해야 할 행동이 있나요?', choices: [] }).text
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<AgentText text={text} />)
  expect(host.querySelectorAll('.agent-section')).toHaveLength(2)
  expect(host.querySelector('strong')?.textContent).toBe('집에서 가능한 방법')
  expect(host.querySelectorAll('ol li')).toHaveLength(3)
  expect(host.querySelector('ol li')?.textContent).toBe('준비할 것을 확인해요.')
  expect(host.querySelector('br')).not.toBeNull()
  expect(host.textContent).not.toContain('**')
})

test('model supplied HTML remains inert text, including in headings and lists', () => {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<AgentText text={'## <img src=x onerror=alert(1)>\n\n1. <script>alert(2)</script>'} />)
  expect(host.querySelector('img,script')).toBeNull()
  expect(host.textContent).toContain('<script>')
})

test('grouped intake renders as numbered questions with only their labels emphasized', () => {
  const text = formatReply({paragraphs:['실행 방법을 맞추기 위해 남은 조건만 확인할게요.'],bullets:[],
    question:'1. **자료**: 어떤 책으로 진행하실 건가요?\n2. **환경**: 소리 내서 읽을 수 있나요?',choices:[]}).text
  const host=document.createElement('div')
  host.innerHTML=renderToStaticMarkup(<AgentText text={text} />)
  expect(host.querySelectorAll('ol')).toHaveLength(1)
  expect(host.querySelectorAll('li')).toHaveLength(2)
  expect([...host.querySelectorAll('strong')].map(node=>node.textContent)).toEqual(['자료','환경'])
  expect(host.textContent).toContain('어떤 책으로 진행하실 건가요?')
  expect(host.textContent).toContain('소리 내서 읽을 수 있나요?')
  expect(host.textContent).not.toContain('**')
})

test('detailed draft shows validated actions and short logging without making ancillary triggers the title', () => {
  const card = { ...emptyGoal, outcome: '독서 기록 만들기', targetMetric: '책 1권 완독', durationWeeks: 4,
    weeklyActions: [{title:'정한 분량 읽기',frequencyPerWeek:2,durationMinutes:20,preferredDays:[]}],
    execution: {measurement:'custom_outcome' as const,completionPercent:null,reviewEveryWeeks:1,progressStrategy:'첫 주 실제 분량 기록',
      actions:[{goalResult:'책 1권 완독',steps:['책갈피에서 이어 읽기','정한 분량까지 읽기','핵심 내용 한 줄 기록'],stepMinutes:[2,15,3],completionCriterion:'읽은 쪽수 기록',minimumAction:'책 펴기',minimumMinutes:1}]} }
  const short = initialGoalMessage(card)
  const detailed = initialGoalMessage(card,[],false,'**현재**: 최근 독서 기록 없음','4주',true)
  expect(short).not.toContain('책갈피에서 이어 읽기')
  expect(detailed).toContain('### 정한 분량 읽기 — 실행 방법')
  expect(detailed).toContain('1. 책갈피에서 이어 읽기')
  expect(detailed).toContain('주 2회 · 20분')
  expect(detailed).toContain('짧게 기록하기')
  expect(detailed).toContain('확정 전')
  expect(detailed).not.toContain('책 펴기')
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<AgentText text={detailed} />)
  expect(host.querySelectorAll('ol li')).toHaveLength(3)
  expect([...host.querySelectorAll('ol li')].map(node=>node.textContent)).toEqual([
    '책갈피에서 이어 읽기 · 예상 2분(휴식·전환 포함)',
    '정한 분량까지 읽기 · 예상 15분(휴식·전환 포함)',
    '핵심 내용 한 줄 기록 · 예상 3분(휴식·전환 포함)',
  ])
})

test('stored coaching methods, management sections and notes all reach the real renderer after reload',()=>{
  // Authored control only: this proves preservation, not generated answer quality.
  const card=materializeGoalDraft(withCoachingDetails({category:'자기계발',outcome:'책의 내용을 설명하기',targetMetric:'책 1권 완독',durationWeeks:4,
    identity:'',cue:'',environment:'',deadline:'',baselineMetric:'첫 장 읽음',measurement:'custom_outcome',completionPercent:null,reviewEveryWeeks:1,
    actions:[{title:'읽고 설명하기',durationMinutes:20,frequencyPerWeek:3,preferredDays:[],steps:['지난 기록과 시작점을 확인한다.','책을 읽고 핵심을 자신의 말로 설명한다.','진행 범위와 어려운 점을 남긴다.'],stepMinutes:[2,15,3],completionCriterion:'핵심 한 문장 기록',minimumAction:'책 펴기',minimumMinutes:1}]}))!
  card.execution!.contextNotes=['정리한 기록은 다음 회차를 조정할 때 함께 확인해요.']
  const reloaded=loadState(JSON.parse(JSON.stringify({goal_card:card})))
  const text=initialGoalMessage(reloaded.goal_card)
  const host=document.createElement('div')
  host.innerHTML=renderToStaticMarkup(<AgentText text={text} />)
  for(const value of [...Object.values(card.execution!.coachingGuide!),...card.execution!.actions[0].steps!,...card.execution!.contextNotes])expect(host.textContent).toContain(value)
  expect(host.querySelectorAll('ol li')).toHaveLength(3)
  expect(host.textContent).not.toContain('**')
  expect(host.textContent).not.toContain('2분 트리거')
})
