import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applySchedule, mergeRhythm, missingRhythm, normalizeSchedule, isDraftAcceptance, deferredEvidence } from '../../supabase/functions/onju-agent-v2/policy.ts'
import { emptyGoal, goalDraftIssue, describeGoal } from '../../supabase/functions/onju-agent-v2/goal.ts'
import { loadState, runAgentTurn } from '../../supabase/functions/onju-agent-v2/agent.ts'
import { formatReply } from '../../supabase/functions/onju-agent-v2/state.ts'

const book = { ...emptyGoal, outcome: '독서 습관', durationWeeks: 2, targetMetric: '2주간 6회', weeklyActions: [{ title: '독서', frequencyPerWeek: 3, durationMinutes: 10, preferredDays: [] }] }
const fullRhythm = [{ days: [0,1,2,3,4,5,6], wake: '06:00', bedtime: '23:00', variable: false }]
test('extra verified receipts still appear before the single final question', () => {
  const reply = formatReply({summary:'반영했어요.',details:['금요일 23:00–24:00'],question:'더 있나요?',choices:[]}, ['토요일 00:00–01:00'])
  assert.ok(reply.text.indexOf('토요일') < reply.text.indexOf('더 있나요?'))
  assert.equal(reply.text.split('\n\n').at(-1), '**더 있나요?**')
})
test('explicit total counts must agree with weekly actions; minimum thresholds are distinct', () => {
  assert.equal(goalDraftIssue(book), null)
  assert.match(goalDraftIssue({...book, targetMetric:'2주간 3회'}), /count_target_mismatch/)
  assert.equal(goalDraftIssue({...book, targetMetric:'2주간 3회 이상'}), null)
  assert.match(goalDraftIssue({...book, targetMetric:'2주간 7회 이상'}), /count_target_mismatch/)
  assert.equal(goalDraftIssue({...book, targetMetric:'독서 후 한 줄 메모'}), null)
  const multi = {...book, weeklyActions:[book.weeklyActions[0],{...book.weeklyActions[0],title:'산책'}]}
  assert.match(goalDraftIssue({...multi,targetMetric:'2주간 총 6회'}), /count_target_mismatch/)
  assert.equal(goalDraftIssue({...multi,targetMetric:'2주간 총 12회'}), null)
  assert.match(goalDraftIssue({...book,weeklyActions:[{...book.weeklyActions[0],title:'5분 독서'}]}), /duration_mismatch/)
  assert.match(goalDraftIssue({...book,weeklyActions:[{...book.weeklyActions[0],title:'매일 독서'}]}), /frequency_mismatch/)
  assert.match(describeGoal({...book,weeklyActions:[{...book.weeklyActions[0],preferredDays:[0,2,4]}]}).join('\n'), /희망 요일: 월·수·금/)
})
const respond = extra => ({ focus: 'schedule', goal_outcome: '', goal_draft: null, summary: '반영했어요.', details: [], question: '더 비워둘 시간이 있나요?', choices: [], ...extra })
function provider(sequence) {
  let i = 0
  return { now: '2026년 9월 4일 오전 9시', request: async () => {
    assert.ok(i < sequence.length, 'unexpected additional model call')
    const [name, args] = sequence[i++]
    return { id: `r${i}`, model: 'gpt-4.1', usage: { input_tokens: 1, output_tokens: 1 }, output: [{ type: 'function_call', name, call_id: `c${i}`, arguments: JSON.stringify(args) }] }
  } }
}
test('partial rhythm persists and asks the exact missing weekday', () => {
  let bounds = mergeRhythm([], [{ days:[5], wake:'08:00', bedtime:'', variable:false }, { days:[6], wake:'07:00', bedtime:'', variable:false }])
  assert.equal(missingRhythm(bounds).day, 5)
  bounds = mergeRhythm(bounds, [{ days:[5], wake:'', bedtime:'24:00', variable:false }])
  assert.equal(bounds[0].wake, '08:00')
  assert.equal(bounds[0].bedtime, '00:00')
  assert.equal(missingRhythm(bounds).question, '일요일에는 보통 몇 시에 잠드나요?')
})
test('explicitly deferred days are not fabricated or repeatedly questioned', () => {
  const bounds = mergeRhythm([], [{ ...fullRhythm[0], days:[0,1,2,3,4] }, { days:[5,6], wake:'', bedtime:'', variable:true, deferred:true }])
  assert.equal(missingRhythm(bounds), null)
  assert.equal(bounds[1].wake, '')
})
test('overnight preserves midnight and Sunday wraps to Monday', () => {
  const result = normalizeSchedule({ days:[6], title:'모임', start:'23:00', end:'01:00', kind:'fixed' })
  assert.deepEqual(result.map(b=>[b.days,b.start,b.end]), [[[6],'23:00','24:00'],[[0],'00:00','01:00']])
  assert.equal(normalizeSchedule({ days:[4], title:'모임', start:'23:00', end:'00:00', kind:'fixed' }).length, 1)
})
test('mixed invalid save is atomic, not silently partially successful', () => {
  const state = { day_bounds: [], blocks: [] }
  assert.throws(()=>applySchedule(state,{bounds:[],updates:[],blocks:[{days:[0],title:'일',start:'09:00',end:'18:00',kind:'fixed'},{days:[0],title:'오류',start:'25:00',end:'26:00',kind:'fixed'}]}))
  assert.deepEqual(state,{day_bounds:[],blocks:[]})
})
test('negative or qualified approval never confirms a draft', () => {
  for(const text of ['아직 확정하지 말고','응, 그런데 주 2회로 바꿔줘','좋아?','그대로 시작하지 말아줘','아니, 다시 추천해줘','그대로 시작할게. 단 기간은 4주로']) assert.equal(isDraftAcceptance(text),false,text)
  for(const text of ['응','이 초안으로 시작할게요','그 초안 그대로 시작할게','좋아 이대로 진행하자']) assert.equal(isDraftAcceptance(text),true,text)
})
test('model proposal cannot mutate confirmed metrics, even when claiming it did', async () => {
  const state = loadState({ stage:5, goal_card:{...book,durationWeeks:4} })
  const result = await runAgentTurn(state,'더 가볍게 초안을 제안해줘. 아직 확정하지는 말고.',provider([['respond',respond({focus:'goals',goal_outcome:'독서',goal_draft:book,summary:'확정 저장했어요.'})],['revise_goal',{edits:[{field:'frequencyPerWeek',actionIndex:0,number:2,text:null,days:null,evidence:'더 가볍게'}]}]]))
  assert.equal(result.state.goal_card.durationWeeks,4)
  assert.deepEqual(result.state.agent_v2_context.draft.card,{...state.goal_card,weeklyActions:[{...book.weeklyActions[0],frequencyPerWeek:2}]})
  assert.match(result.assistant_message,/아직 확정하지/)
  assert.doesNotMatch(result.assistant_message,/확정 저장했어요/)
})
test('confirmation commits exact displayed version without any model request', async () => {
  const state = loadState({stage:5,agent_v2_context:{version:3,draft:{id:'draft-1',card:book,presentedMessageId:'a'}},messages:[{id:'a',role:'assistant',text:'이 초안으로 시작할까요?'}]})
  const result = await runAgentTurn(state,'이 초안으로 시작할게요',provider([]),{draftId:'draft-1'})
  assert.deepEqual(result.state.goal_card,book)
  assert.equal(result.state.agent_v2_context.draft,null)
  assert.equal(result.events.some(e=>e.tool==='model_usage'),false)
  await assert.rejects(()=>runAgentTurn(state,'이 초안으로 시작할게요',provider([]),{draftId:'old-version'}),/draft_changed/)
})
test('yes to an unrelated newer question does not approve an old draft', async () => {
  const state = loadState({stage:5,agent_v2_context:{version:3,draft:{id:'d',card:book,presentedMessageId:'old'}},messages:[{id:'new',role:'assistant',text:'토요일 일정이 있나요?'}]})
  const result = await runAgentTurn(state,'응',provider([['respond',respond({focus:'goals',question:'토요일 일정은 몇 시인가요?'})]]))
  assert.equal(result.state.goal_card.durationWeeks,0)
})
test('respond cannot skip an unanswered Sunday bedtime', async () => {
  const initial=loadState({day_bounds:[{...fullRhythm[0],days:[0,1,2,3,4]},{days:[5],wake:'08:00',bedtime:'',variable:false},{days:[6],wake:'07:00',bedtime:'',variable:false}]})
  const result=await runAgentTurn(initial,'토요일 자정에 자요',provider([
    ['apply_schedule',{bounds:[{days:[5],wake:'',bedtime:'00:00',variable:false,deferred:false}],blocks:[],updates:[]}],
    ['respond',respond({question:'다음으로 근무 시간을 알려주세요?'})],
  ]))
  assert.equal(result.state.stage,0)
  assert.match(result.assistant_message,/일요일에는 보통 몇 시에 잠드나요/)
  assert.doesNotMatch(result.assistant_message,/근무 시간/)
})
test('receipt states actual full overnight interval, not model fiction', async () => {
  const result=await runAgentTurn(loadState({stage:1,day_bounds:fullRhythm}),'금요일 밤11시부터 토요일 새벽1시 모임',provider([
    ['apply_schedule',{bounds:[],blocks:[{days:[4],title:'모임',start:'23:00',end:'01:00',kind:'fixed'}],updates:[]}],
    ['respond',respond({summary:'모든 일정을 22시부터 반영했어요.',details:['틀린 정보']})],
  ]))
  assert.match(result.assistant_message,/23:00–24:00/)
  assert.match(result.assistant_message,/00:00–01:00/)
  assert.doesNotMatch(result.assistant_message,/22시|틀린 정보/)
})
test('failed save cannot be presented as success even if the model claims success', async () => {
  const result=await runAgentTurn(loadState({stage:1,day_bounds:fullRhythm}),'모임을 추가해줘',provider([
    ['apply_schedule',{bounds:[],blocks:[{days:[4],title:'모임',start:'25:00',end:'26:00',kind:'fixed'}],updates:[]}],
    ['respond',respond({summary:'모임을 모두 반영했어요.',details:['금요일 모임 완료']})],
  ]))
  assert.deepEqual(result.state.blocks,[])
  assert.match(result.assistant_message,/아직 반영하지 못했어요/)
  assert.doesNotMatch(result.assistant_message,/모두 반영했어요|모임 완료/)
})

test('first message with variable weekends saves rhythm and explains the next schedule question', async () => {
  const result = await runAgentTurn(loadState(null), '평일은 5시반, 22시반에 취침하고, 주말은 변동이 많아', provider([
    ['apply_schedule', { bounds:[{days:['월','화','수','목','금'],wake:'05:30',bedtime:'22:30',variable:false,deferred:false},{days:['토','일'],wake:'',bedtime:'',variable:true,deferred:true}], blocks:[], updates:[] }],
    ['respond', respond({question:'이 밖에 비워둘 시간이 있나요?'})],
  ]))
  assert.equal(result.state.stage, 1)
  assert.equal(result.state.day_bounds[0].wake, '05:30')
  assert.equal(result.state.day_bounds[0].bedtime, '22:30')
  assert.equal(result.state.day_bounds[1].deferred, true)
  assert.equal(result.state.day_bounds[1].wake, '')
  assert.equal(result.state.goal_card.weeklyActions.length, 0)
  assert.equal(result.state.agent_v2_context.draft, null)
  assert.match(result.assistant_message, /목표와 루틴.*생활 시간/)
  assert.match(result.assistant_message.split('\n\n').at(-1), /이동이나 근무.*몇 시부터 몇 시/)
  assert.doesNotMatch(result.assistant_message, /기존 확정 목표|초안의 실행량/)
  assert.equal(result.events.filter(e=>e.tool==='model_usage').length, 2)
})

test('variable rhythm expressions are accepted without treating fixed times as deferred', () => {
  for (const message of ['주말은 변동이 많아','주말은 변동이 있어','매주 달라','날마다 달라져','아직 정해지지 않았어']) assert.equal(deferredEvidence(message), true, message)
  for (const message of ['주말은 변동이 없어','주말에도 일정해','시간을 변경해줘']) assert.equal(deferredEvidence(message), false, message)
})

test('exhausted first rhythm validation never claims a confirmed goal exists', async () => {
  const bad = ['apply_schedule', {bounds:[{days:['월'],wake:'25:00',bedtime:'23:00',variable:false,deferred:false}],blocks:[],updates:[]}]
  const result = await runAgentTurn(loadState(null), '평일 생활 시간을 말할게', provider(Array.from({length:5},()=>bad)))
  assert.deepEqual(result.state.day_bounds, [])
  assert.match(result.assistant_message, /생활 시간|시간 지도/)
  assert.match(result.assistant_message, /기상.*취침/)
  assert.doesNotMatch(result.assistant_message, /확정 목표|초안|실행할 행동/)
  assert.ok(result.events.some(e=>e.tool==='schedule_validation_exhausted'))
})

test('successful rhythm is preserved and acknowledged even if final reply formatting repeatedly fails', async () => {
  const result = await runAgentTurn(loadState(null), '평일 5시반 기상 22시반 취침, 주말은 그때그때 달라', provider([
    ['apply_schedule',{bounds:[{days:['월','화','수','목','금'],wake:'05:30',bedtime:'22:30',variable:false,deferred:false},{days:['토','일'],wake:'',bedtime:'',variable:true,deferred:true}],blocks:[],updates:[]}],
    ...Array.from({length:4},()=>['respond',respond({choices:['하나뿐인 선택지']})]),
  ]))
  assert.equal(result.state.day_bounds[0].wake,'05:30')
  assert.match(result.assistant_message,/반영했어요/)
  assert.match(result.assistant_message,/05:30/)
  assert.match(result.assistant_message,/이동이나 근무/)
  assert.doesNotMatch(result.assistant_message,/기존 확정 목표|맞추지 못했어요/)
})
