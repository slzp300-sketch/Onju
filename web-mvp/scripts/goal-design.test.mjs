import {test} from 'node:test'
import assert from 'node:assert/strict'
import {emptyGoal,initialGoalProseIssue} from '../../supabase/functions/onju-agent-v2/goal.ts'
import {reviseGoal,relatedApproval,draftMessage} from '../../supabase/functions/onju-agent-v2/goalRevision.ts'
import {effortPolicy,effortIssue,fitsDailyCapacity} from '../../supabase/functions/onju-agent-v2/goalEffort.ts'
import {loadState,runAgentTurn} from '../../supabase/functions/onju-agent-v2/agent.ts'
const action=(title,f=3,m=10)=>({title,frequencyPerWeek:f,durationMinutes:m,preferredDays:[]})
const book={...emptyGoal,outcome:'독서 습관',durationWeeks:2,targetMetric:'2주간 6회',weeklyActions:[action('독서')],fallbackAction:'책을 펼쳐 한 문장만 읽기'}
const edit=(field,number,evidence,actionIndex=0)=>({field,number,evidence,actionIndex,text:null,days:null})
const respond=card=>['respond',{focus:'goals',goal_outcome:'독서',goal_draft:{...card,execution:card.execution??{measurement:'routine_completion',completionPercent:null,reviewEveryWeeks:1,actions:card.weeklyActions.map(a=>({completionCriterion:a.title+' 기록 한 줄 남기기',minimumAction:a.title+' 시작 기록 한 줄 적기',minimumMinutes:1}))}},summary:'초안이에요.',details:[],question:'시작할까요?',choices:[]}]
const provider=steps=>{let i=0;return{now:'2026년 9월 4일 오전 9시',request:async()=>{assert.ok(i<steps.length,'unexpected extra call');const [name,args]=steps[i++];return{id:'r'+i,model:'gpt-4.1',usage:{input_tokens:1,output_tokens:1},output:[{type:'function_call',name,call_id:'c'+i,arguments:JSON.stringify(args)}]}}}}

test('frequency-only edit preserves every other field and action exactly',()=>{
 const base={...book,targetMetric:'2주간 최소 7회',weeklyActions:[action('업무 회고',2,5),action('산책',2,20),action('기도',3,3)]}
 const r=reviseGoal(base,[edit('frequencyPerWeek',1,'회고만 주 1회')],'회고만 주 1회로 줄여줘. 나머지는 그대로')
 assert.deepEqual(r.card,{...base,weeklyActions:[{...base.weeklyActions[0],frequencyPerWeek:1},...base.weeklyActions.slice(1)]})
 assert.equal(r.related,undefined);assert.equal(r.changes.length,1)
})
test('unrelated fields, wrong numbers and invented user evidence are rejected',()=>{
 const text='독서 횟수만 주 1회로 줄여줘'
 assert.throws(()=>reviseGoal(book,[{...edit('targetMetric',null,text,-1),text:'2주간 2회'}],text),/unrequested_goal_field|only_frequency/)
 assert.throws(()=>reviseGoal(book,[edit('frequencyPerWeek',2,text)],text),/goal_number_not_in_user_request/)
 assert.throws(()=>reviseGoal(book,[edit('frequencyPerWeek',1,'가짜 요청')],text),/exact_user_evidence/)
})
test('specific action, duplicate fields and unknown indexes are guarded atomically',()=>{
 const multi={...book,weeklyActions:[action('독서'),action('산책')]}
 assert.throws(()=>reviseGoal(multi,[edit('frequencyPerWeek',1,'독서만 주 1회',1)],'독서만 주 1회'),/goal_action_not_requested/)
 assert.throws(()=>reviseGoal(book,[edit('frequencyPerWeek',1,'주 1회',4)],'주 1회'),/invalid_goal_action_index/)
 const e=edit('frequencyPerWeek',1,'주 1회')
 assert.throws(()=>reviseGoal(book,[e,e],'주 1회'),/duplicate_goal_edit/)
 assert.equal(book.weeklyActions[0].frequencyPerWeek,3)
})
test('related count change is separate from the requested draft',()=>{
 const r=reviseGoal(book,[edit('frequencyPerWeek',1,'주 1회')],'주 1회로 줄여줘')
 assert.equal(r.card.targetMetric,'2주간 6회');assert.equal(r.related.card.targetMetric,'2주간 2회')
 assert.equal(r.related.changes[0].before,'2주간 6회')
 assert.match(draftMessage({...r,id:'d',presentedMessageId:'a'}),/함께 확인할 조건/)
})
test('duration edit keeps title until the related wording is approved',()=>{
 const base={...book,weeklyActions:[action('독서 10분')]}
 const r=reviseGoal(base,[edit('durationMinutes',5,'시간만 5분')],'시간만 5분으로 바꿔줘')
 assert.equal(r.card.weeklyActions[0].title,'독서 10분');assert.equal(r.related.card.weeklyActions[0].title,'독서 5분')
})
test('count in outcome and period changes are also separately reviewed',()=>{
 const base={...book,outcome:'2주간 6회 독서 실천'}
 const r=reviseGoal(base,[edit('frequencyPerWeek',1,'주 1회')],'주 1회로 줄여줘')
 assert.equal(r.card.outcome,base.outcome)
 assert.equal(r.related.card.outcome,'2주간 2회 독서 실천')
 assert.equal(r.related.changes.length,2)
 const period=reviseGoal(base,[edit('durationWeeks',4,'기간을 4주로',-1)],'기간을 4주로 늘려줘')
 assert.equal(period.card.targetMetric,'2주간 6회')
 assert.equal(period.related.card.targetMetric,'4주간 12회')
 assert.equal(period.related.card.outcome,'4주간 12회 독서 실천')
})
test('ambiguous yes cannot approve related changes; explicit versioned choice commits exactly',async()=>{
 const r=reviseGoal(book,[edit('frequencyPerWeek',1,'주 1회')],'주 1회')
 const s=loadState({stage:5,goal_card:book,agent_v2_context:{version:3,draft:{...r,id:'d',presentedMessageId:'a'}},messages:[{id:'a',role:'assistant',text:'함께 조정할까요?'}]})
 const no=await runAgentTurn(s,'응',provider([]))
 assert.deepEqual(no.state.goal_card,book);assert.ok(no.state.agent_v2_context.draft)
 const yes=await runAgentTurn(no.state,relatedApproval,provider([]),{draftId:'d',includeRelated:true})
 assert.deepEqual(yes.state.goal_card,r.related.card);assert.equal(yes.state.agent_v2_context.draft,null)
 await assert.rejects(()=>runAgentTurn(s,relatedApproval,provider([]),{draftId:'old',includeRelated:true}),/draft_changed/)
})
test('light starting policy rejects 60-minute suggestion and requires fallback',async()=>{
 const heavy={...book,weeklyActions:[action('독서',3,60)]}
 const result=await runAgentTurn(loadState({stage:5}),'가볍게 독서 습관부터 추천해줘',provider([respond(heavy),respond(book)]))
 assert.equal(result.state.agent_v2_context.draft.card.weeklyActions[0].durationMinutes,10)
 assert.ok(result.events.some(e=>e.result?.error?.startsWith('lighter_draft_needed')))
 assert.match(effortIssue({...book,fallbackAction:''},effortPolicy([],[],[])),/fallback_needed/)
})
test('user budgets and known calendar windows lower starting load without inventing time',()=>{
 const bounds=[{days:[0,1,2,3,4],wake:'06:00',bedtime:'23:00',variable:false}]
 const p=effortPolicy(['하루 10분밖에 없어'],bounds,[])
 assert.equal(p.perSession,10);assert.equal(p.weekly,50)
 const crowded=[{days:[0,1,2,3,4],title:'보호할 시간',start:'06:00',end:'22:55',kind:'fixed'}]
 const short=effortPolicy([],bounds,crowded)
 assert.equal(short.perSession,5);assert.equal(short.weekly,25)
 assert.equal(effortPolicy(['주당 30분 가능해'],[],[]).weekly,30)
 assert.equal(effortPolicy([],[],[]).capacity,null)
})
test('explicit longer routine is respected rather than silently shortened',()=>{
 const p=effortPolicy(['운동을 주 3회 60분씩 하고 싶어'],[],[])
 assert.equal(p.perSession,60);assert.equal(p.weekly,180)
 assert.equal(effortIssue({...book,weeklyActions:[action('운동',3,60)]},p),null)
})
test('weekly total alone cannot pass an impossible daily budget',()=>{
 const six={...book,weeklyActions:[action('업무',2,8),action('건강',2,8),action('신앙',2,8)]}
 assert.equal(fitsDailyCapacity(six,[10,10,10,10,10,0,0]),false)
 assert.equal(fitsDailyCapacity({...six,weeklyActions:six.weeklyActions.map(a=>({...a,durationMinutes:5}))},[10,10,10,10,10,0,0]),true)
})
test('unsolicited end dates are not presented as facts',async()=>{
 const result=await runAgentTurn(loadState({stage:5}),'독서 습관 초안을 추천해줘',provider([respond({...book,deadline:'2026-10-02'})]))
 assert.equal(result.state.agent_v2_context.draft.card.deadline,'')
 assert.doesNotMatch(result.assistant_message,/2026-10-02/)
})

test('new goal headlines cannot promise daily or per-domain counts that actions do not support',async()=>{
 const actions=[action('업무',2,5),action('건강',2,5),action('신앙',1,5)]
 const multi={...book,targetMetric:'2주간 총 10회',weeklyActions:actions,outcome:'일, 건강, 신앙을 각각 주당 5회 실천'}
 assert.match(initialGoalProseIssue(multi),/goal_prose_frequency_mismatch/)
 assert.match(initialGoalProseIssue({...multi,outcome:'퇴근 후 매일 일, 건강, 신앙 실천'}),/goal_prose_frequency_mismatch/)
 assert.equal(initialGoalProseIssue({...multi,outcome:'세 분야를 합쳐 주 5회 실천'}),null)
 const corrected={...multi,outcome:'일, 건강, 신앙의 작은 습관 만들기'}
 const result=await runAgentTurn(loadState({stage:5}),'세 분야를 가볍게 추천해줘',provider([respond(multi),respond(corrected)]))
 assert.equal(result.state.agent_v2_context.draft.card.outcome,corrected.outcome)
 assert.ok(result.events.some(e=>e.result?.error?.startsWith('goal_prose_frequency_mismatch')))
})
test('revision tool does not mutate confirmed goal before approval',async()=>{
 const text='독서 횟수만 주 1회로 줄여줘'
 const result=await runAgentTurn(loadState({stage:5,goal_card:book}),text,provider([['revise_goal',{edits:[edit('frequencyPerWeek',1,text)]}]]))
 assert.deepEqual(result.state.goal_card,book)
 assert.equal(result.state.agent_v2_context.draft.card.weeklyActions[0].frequencyPerWeek,1)
 assert.ok(result.state.agent_v2_context.draft.related)
})
