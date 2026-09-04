import {test} from 'node:test'
import assert from 'node:assert/strict'
import {emptyGoal,validGoalCard,materializeGoalDraft,goalSchema,goalSchemaForAreas,goalSchemaForRequest,requestedSingleSession,goalSessionIssue,describeGoal,requestedGoalAreas,goalCoverageIssue,initialGoalProseIssue} from '../../supabase/functions/onju-agent-v2/goal.ts'
import {executionIssue,executionSummary,synchronizeExecution,normalizeDerivedExecutionText,initialGoalMessage} from '../../supabase/functions/onju-agent-v2/goalExecution.ts'
import {reviseGoal,relatedApproval} from '../../supabase/functions/onju-agent-v2/goalRevision.ts'
import {loadState,runAgentTurn} from '../../supabase/functions/onju-agent-v2/agent.ts'

const guide=()=>({completionCriterion:'읽은 문장 하나 표시하기',minimumAction:'책 한 문장 읽기',minimumMinutes:1})
const book=()=>({...emptyGoal,outcome:'독서 습관',durationWeeks:2,targetMetric:'실행률 80%',weeklyActions:[{title:'독서',frequencyPerWeek:3,durationMinutes:10,preferredDays:[]}],execution:{measurement:'routine_completion',completionPercent:80,reviewEveryWeeks:1,actions:[guide()]}})
const edit=(field,number,evidence,actionIndex=0)=>({field,number,evidence,actionIndex,text:null,days:null})
const compact=card=>({category:card.category,outcome:card.outcome,identity:card.identity,cue:card.cue,environment:card.environment,deadline:card.deadline,baselineMetric:card.baselineMetric,targetMetric:card.targetMetric,durationWeeks:card.durationWeeks,measurement:card.execution.measurement,completionPercent:card.execution.completionPercent,reviewEveryWeeks:card.execution.reviewEveryWeeks,actions:card.weeklyActions.map((action,index)=>({...action,...card.execution.actions[index]}))})

test('explicitly requested goal areas cannot be dropped when making a lighter draft',()=>{
 const areas=requestedGoalAreas('일적인 부분과 건강, 신앙 세 파트야. 초안부터 추천해줘')
 assert.deepEqual(areas,['일','건강','신앙'])
 const card=book();card.weeklyActions[0].title='오늘 할 일 정리'
 assert.match(goalCoverageIssue(card,areas),/건강·신앙/)
 card.weeklyActions.push({...card.weeklyActions[0],title:'스트레칭'},{...card.weeklyActions[0],title:'감사 기도'})
 card.execution.actions.push(guide(),guide())
 assert.equal(goalCoverageIssue(card,areas),null)
 for(const text of ['업무가 바빠서 건강 목표부터','일과 건강 말고 신앙만','건강과 신앙 중 한 분야를 추천해줘'])assert.deepEqual(requestedGoalAreas(text),[])
})
test('new action titles offer one concrete activity rather than another choice',()=>{
 const card=book()
 for(const title of ['기도 또는 묵상','독서/산책','후보 중 하나']){card.weeklyActions[0].title=title;assert.match(initialGoalProseIssue(card),/goal_action_choice_ambiguous/)}
 card.weeklyActions[0].title='감사 기도';assert.equal(initialGoalProseIssue(card),null)
})
test('multi-area schema requires each requested area before generation, with stable persisted order',()=>{
 const areas=['일','건강','신앙'],schema=goalSchemaForAreas(areas)
 assert.deepEqual(schema.properties.actions.required,areas)
 const input=compact(book()),action=input.actions[0]
 input.actions={신앙:{...action,title:'감사 기도'},일:{...action,title:'업무 정리'},건강:{...action,title:'스트레칭'}}
 const card=materializeGoalDraft(input,areas)
 assert.deepEqual(card.weeklyActions.map(a=>a.title),['업무 정리','스트레칭','감사 기도'])
 delete input.actions.건강
 assert.equal(materializeGoalDraft(input,areas),null)
 assert.equal(goalSchemaForAreas([]),goalSchema)
})
test('explicit per-session time and frequency are fixed in the generation schema',()=>{
 const message='운동을 주 3회 60분씩 하고 싶어. 이 횟수와 시간은 유지해서 2주 시험 계획을 제안해줘'
 assert.deepEqual(requestedSingleSession(message),{frequency:3,minutes:60})
 const schema=goalSchemaForRequest([],message)
 assert.equal(schema.properties.actions.minItems,1);assert.equal(schema.properties.actions.maxItems,1)
 assert.deepEqual(schema.properties.actions.items.properties.frequencyPerWeek.enum,[3])
 assert.deepEqual(schema.properties.actions.items.properties.durationMinutes.enum,[60])
 const card=book();card.weeklyActions=[{title:'유산소',frequencyPerWeek:3,durationMinutes:30,preferredDays:[]},{title:'근력',frequencyPerWeek:3,durationMinutes:30,preferredDays:[]}]
 assert.match(goalSessionIssue(card,message),/preserve_single_session/)
 card.weeklyActions=[{...card.weeklyActions[0],title:'운동',durationMinutes:60}]
 assert.equal(goalSessionIssue(card,message),null)
})
test('session constraints do not change unrelated, multi-area, capped or corrective requests',()=>{
 for(const message of ['하루 10분밖에 없어. 일, 건강, 신앙 초안을 추천해줘','일정은 여기까지야','주 3회 60분씩 대신 주 2회로','주 3회 60분씩 이하로 추천해줘','운동 주 3회 60분씩, 독서 주 2회 10분씩']){
  assert.equal(requestedSingleSession(message),null)
  const areas=requestedGoalAreas(message)
  assert.deepEqual(goalSchemaForRequest(areas,message),goalSchemaForAreas(areas))
 }
})

test('compact model proposal maps one action list into the backwards-compatible card',()=>{
 const input=compact(book());input.cue='저녁 식사 후';input.environment='책상에 책 놓기'
 const card=materializeGoalDraft(input)
 assert.ok(validGoalCard(card));assert.deepEqual(card.weeklyActions,book().weeklyActions);assert.deepEqual(card.execution,book().execution)
 assert.equal(card.cue,input.cue);assert.equal(card.environment,input.environment)
 assert.equal(card.tinyStart,'');assert.equal(card.fallbackAction,'')
 assert.equal(goalSchema.properties.weeklyActions,undefined);assert.equal(goalSchema.properties.execution,undefined)
 assert.equal(goalSchema.properties.tinyStart,undefined)
 for(const change of [{actions:[]},{actions:[null]},{measurement:'unknown'},{completionPercent:101},{reviewEveryWeeks:0},{durationWeeks:0}])assert.equal(materializeGoalDraft({...input,...change}),null)
})
test('matching duration prose is normalized without another AI call, conflicting durations are not changed',()=>{
 for(const text of ['10분 독서하고 한 문장 표시하기','600초 동안 독서하고 한 문장 표시하기','10분간 독서하고 한 문장 표시하기']){
  const card=book();card.execution.actions[0].completionCriterion=text
  const normalized=normalizeDerivedExecutionText(card)
  assert.equal(normalized.execution.actions[0].completionCriterion,'독서하고 한 문장 표시하기')
  assert.equal(executionIssue(normalized),null)
  assert.equal(card.execution.actions[0].completionCriterion,text)
 }
 for(const text of ['5분 독서하기','5~10분 독서하기','10분 이내에 읽기','10분 읽고 5분 정리하기']){
  const card=book();card.execution.actions[0].completionCriterion=text
  assert.equal(normalizeDerivedExecutionText(card).execution.actions[0].completionCriterion,text)
  assert.match(executionIssue(normalizeDerivedExecutionText(card)),/criterion_duration/)
 }
})
test('one validation response reports every execution issue, not sequential repair requests',()=>{
 const card=book();card.execution.reviewEveryWeeks=4;card.execution.actions[0].minimumAction='후보 중 하나 5분 시도';card.execution.actions[0].completionCriterion='7분 읽기'
 const issue=executionIssue(card)
 for(const name of ['review_after_trial','minimum_must_be_specific','criterion_duration','minimum_time_mismatch'])assert.ok(issue.includes(name))
})
test('visible structured draft has one canonical minimum and each section only once',()=>{
 const card=synchronizeExecution(book());card.tinyStart='매일 책을 읽기'
 const text=initialGoalMessage(card)
 assert.doesNotMatch(text,/매일 책을 읽기/);assert.doesNotMatch(describeGoal(card).join('\n'),/매일 책을 읽기/)
 for(const heading of ['**목표**','**시험 기간**','**주간 실행**','**완료 기준**','**바쁜 날 최소 실행**','**점검**'])assert.equal(text.split(heading).length-1,1)
 assert.equal(text.split(card.execution.actions[0].minimumAction).length-1,1)
 assert.match(text,/기본 실행 시간을 채우고/);assert.match(text,/같은 회차는 한 번만/)
})
test('omitted duplicate percent and an activity selected by evidence need no repair',()=>{
 const card=book();card.execution.completionPercent=null;card.weeklyActions[0].title='독서 또는 산책';card.execution.actions[0].completionCriterion='독서 기록 한 줄 남기기'
 const fixed=normalizeDerivedExecutionText(card)
 assert.equal(fixed.execution.completionPercent,80);assert.equal(fixed.weeklyActions[0].title,'독서');assert.equal(executionIssue(fixed),null)
 assert.equal(card.execution.completionPercent,null);assert.equal(card.weeklyActions[0].title,'독서 또는 산책')
 card.execution.completionPercent=90
 assert.match(executionIssue(normalizeDerivedExecutionText(card)),/completion_percent_mismatch/)
 card.execution.actions[0].completionCriterion='독서와 산책 모두 기록하기'
 assert.equal(normalizeDerivedExecutionText(card).weeklyActions[0].title,'독서 또는 산책')
})
test('named slots do not reject valid priorities or gratitude for lacking a keyword',async()=>{
 const input=compact(book()),action=input.actions[0]
 input.completionPercent=null
 input.actions={일:{...action,title:'우선순위 적기',completionCriterion:'우선순위 하나 기록',minimumAction:'우선순위 한 줄 적기'},건강:{...action,title:'가벼운 스트레칭'},신앙:{...action,title:'감사한 일 기록',completionCriterion:'감사한 일 한 가지 적기',minimumAction:'감사한 일 한 줄 적기'}}
 let calls=0
 const result=await runAgentTurn(loadState({stage:5}),'일, 건강, 신앙 초안을 추천해줘',{now:'한국시간',request:async()=>{calls++;return {id:'areas',model:'gpt-4.1',usage:{input_tokens:1,output_tokens:1},output:[{type:'function_call',name:'respond',call_id:'c',arguments:JSON.stringify({focus:'goals',goal_outcome:'세 분야',goal_draft:input,summary:'',details:[],question:'',choices:[]})}]}}})
 assert.equal(calls,1);assert.ok(result.state.agent_v2_context.draft);assert.equal(result.state.agent_v2_context.draft.card.execution.completionPercent,80)
})
test('compact live-shaped draft with redundant duration succeeds in exactly one provider call',async()=>{
 const input=compact(book());input.actions[0].completionCriterion='10분 읽고 한 문장 표시하기'
 let calls=0
 const result=await runAgentTurn(loadState({stage:5}),'독서 주 3회 10분씩 2주, 실행률 80%로 추천해줘',{now:'한국시간',request:async()=>{calls++;return {id:'compact',model:'gpt-4.1',usage:{input_tokens:1,output_tokens:1},output:[{type:'function_call',name:'respond',call_id:'c',arguments:JSON.stringify({focus:'goals',goal_outcome:'독서',goal_draft:input,summary:'',details:[],question:'',choices:[]})}]}}})
 assert.equal(calls,1);assert.ok(result.state.agent_v2_context.draft)
 assert.equal(executionIssue(result.state.agent_v2_context.draft.card),null)
 assert.equal(result.state.goal_card.weeklyActions.length,0)
})

test('execution percentage uses planned sessions, rounding up, and excludes minimum-only records',()=>{
 const card=synchronizeExecution(book())
 assert.equal(card.targetMetric,'2주간 계획한 기본 실행 6회 중 5회 이상 완료 (80% 기준·올림)')
 assert.match(executionSummary(card).join('\n'),/최소 실행.*기본 실행 완료 횟수에는 넣지/)
 assert.match(executionSummary(card).join('\n'),/계획한 10분 실행 \+ 읽은 문장 하나/)
})
test('multiple actions have a total denominator rather than an undefined percent',()=>{
 const card=book();card.weeklyActions.push({...card.weeklyActions[0],title:'산책',frequencyPerWeek:2});card.execution.actions.push({completionCriterion:'걸은 뒤 기록 한 줄 남기기',minimumAction:'집 앞까지 걸어가기',minimumMinutes:2})
 assert.match(synchronizeExecution(card).targetMetric,/기본 실행 10회 중 8회/)
})
test('non-routine outcome percentages are not converted into completion percentages',()=>{
 const card=book();card.targetMetric='매출 20% 증가';card.execution.measurement='custom_outcome';card.execution.completionPercent=null
 assert.equal(synchronizeExecution(card).targetMetric,'매출 20% 증가')
 assert.equal(executionIssue(card),null)
})
test('review interval is bounded by trial and derived text replaces stale 4-week default',()=>{
 const card=book();assert.match(synchronizeExecution(card).reviewCycle,/2주 시험 종료/)
 assert.doesNotMatch(synchronizeExecution(card).reviewCycle,/4주/)
 card.execution.reviewEveryWeeks=4;assert.match(executionIssue(card),/review_after_trial/)
})
test('every action needs its own concrete minimum and completion evidence',()=>{
 const card=book();card.execution.actions=[];assert.equal(validGoalCard(card),false)
 for(const text of ['가능한 만큼 해보기','후보 중 하나 시도','책 읽기 또는 산책','행동을 해보기']){
   const c=book();c.execution.actions[0].minimumAction=text;assert.match(executionIssue(c),/minimum_must_be_specific/,text)
 }
 const c=book();c.execution.actions[0].minimumMinutes=3;assert.equal(validGoalCard(c),false)
 const long=book();long.execution.actions[0].minimumAction='책을 5분 읽기';assert.match(executionIssue(long),/minimum_time_mismatch/)
 const criterion=book();criterion.execution.actions[0].completionCriterion='10분 독서하기';assert.match(executionIssue(criterion),/criterion_duration_is_derived/)
})
test('percentage statement and structured threshold cannot disagree',()=>{
 const card=book();card.execution.completionPercent=90;assert.match(executionIssue(card),/completion_percent_mismatch/)
})
test('legacy persisted goals remain readable and are not enriched or overwritten on approval',async()=>{
 const legacy=book();delete legacy.execution
 assert.equal(validGoalCard(legacy),true)
 const state=loadState({stage:5,agent_v2_context:{version:3,draft:{id:'old',card:legacy,presentedMessageId:'a'}},messages:[{id:'a',role:'assistant',text:'시작할까요?'}]})
 const result=await runAgentTurn(state,'응',{now:'한국시간',request:async()=>{throw Error('approval must not call AI')}})
 assert.deepEqual(result.state.goal_card,legacy)
})
test('frequency edit keeps percentage target text until derived denominator change is separately approved',async()=>{
 const base=synchronizeExecution(book());const changed=reviseGoal(base,[edit('frequencyPerWeek',1,'주 1회')],'독서 주 1회로 줄여줘')
 assert.equal(changed.card.targetMetric,base.targetMetric)
 assert.match(changed.related.card.targetMetric,/기본 실행 2회 중 2회/)
 assert.deepEqual(changed.card.execution,base.execution)
 const state=loadState({goal_card:base,agent_v2_context:{version:3,draft:{...changed,id:'new',presentedMessageId:'a'}},messages:[{id:'a',role:'assistant',text:'확인할까요?'}]})
 const deps={now:'한국시간',request:async()=>{throw Error('no call')}}
 assert.deepEqual((await runAgentTurn(state,'응',deps)).state.goal_card,base)
 const yes=await runAgentTurn(state,relatedApproval,deps,{draftId:'new',includeRelated:true})
 assert.deepEqual(yes.state.goal_card,changed.related.card)
})
test('shorter trial proposes bounded review and final review date as related changes',()=>{
 const base=book();base.durationWeeks=4;base.execution.reviewEveryWeeks=4
 const old=synchronizeExecution(base),result=reviseGoal(old,[edit('durationWeeks',2,'기간을 2주로',-1)],'기간을 2주로 줄여줘')
 assert.equal(result.card.execution.reviewEveryWeeks,4)
 assert.equal(result.related.card.execution.reviewEveryWeeks,2)
 assert.match(result.related.card.reviewCycle,/2주 시험 종료/)
 assert.ok(result.related.changes.some(c=>c.label==='점검 간격'))
})
test('structured guide edit preserves all unrelated conditions',()=>{
 const old=synchronizeExecution(book())
 const result=reviseGoal(old,[{...edit('minimumAction',null,'최소 행동은 책 제목만 읽기'),text:'책 제목만 읽기'}],'독서 최소 행동은 책 제목만 읽기로 바꿔줘')
 assert.equal(result.card.execution.actions[0].minimumAction,'책 제목만 읽기')
 assert.equal(result.card.fallbackAction,old.fallbackAction)
 assert.equal(result.card.targetMetric,old.targetMetric)
 assert.match(result.related.card.fallbackAction,/책 제목만 읽기/)
})
test('common Korean numerals and an explicit replacement number are supported',()=>{
 const old=synchronizeExecution(book())
 assert.equal(reviseGoal(old,[edit('frequencyPerWeek',1,'일주일에 한 번')],'독서 횟수만 일주일에 한 번으로 바꿔줘').card.weeklyActions[0].frequencyPerWeek,1)
 assert.equal(reviseGoal(old,[edit('durationMinutes',5,'시간만 오 분')],'독서 시간만 오 분으로 바꿔줘').card.weeklyActions[0].durationMinutes,5)
 assert.throws(()=>reviseGoal(old,[edit('durationMinutes',5,'5분 말고 7분')],'독서 시간은 5분 말고 7분으로'),/rejected_value/)
 assert.equal(reviseGoal(old,[edit('durationMinutes',7,'5분 말고 7분')],'독서 시간은 5분 말고 7분으로').card.weeklyActions[0].durationMinutes,7)
})

test('single-action headline quantities are separately corrected, never silently left contradictory',()=>{
 const old=synchronizeExecution({...book(),outcome:'2주 동안 매주 3회, 10분 이상 독서 실천'})
 const result=reviseGoal(old,[edit('durationMinutes',7,'시간만 7분')],'독서 시간만 7분으로 바꿔줘')
 assert.equal(result.card.outcome,old.outcome)
 assert.match(result.related.card.outcome,/7분/)
 assert.doesNotMatch(result.related.card.outcome,/10분/)
 const freq=reviseGoal(old,[edit('frequencyPerWeek',1,'주 1회')],'독서 주 1회로 줄여줘')
 assert.match(freq.related.card.outcome,/주 1회/)
 assert.equal(freq.card.outcome,old.outcome)
})

test('new draft validates all constraints together and preserves explicit completion percent',async()=>{
 const bad=book();bad.execution.completionPercent=90;bad.targetMetric='실행률 90%'
 const good=book()
 let i=0
 const result=await runAgentTurn(loadState({stage:5}),'독서 실행률 80%로 추천해줘',{now:'한국시간',request:async()=>({id:'x'+i,model:'gpt-4.1',usage:{input_tokens:1,output_tokens:1},output:[{type:'function_call',name:'respond',call_id:'c'+i,arguments:JSON.stringify({focus:'goals',goal_outcome:'독서',goal_draft:[bad,good][i++],summary:'초안',details:[],question:'시작할까요?',choices:[]})}]})})
 assert.equal(result.state.agent_v2_context.draft.card.execution.completionPercent,80)
 assert.ok(result.events.some(e=>e.result?.error?.includes('preserve_requested_completion_percent')))
})
test('exhausted draft validation is a clear coaching message, not a network error or confirmation',async()=>{
 const base=synchronizeExecution(book())
 const result=await runAgentTurn(loadState({stage:5,goal_card:base}),'독서 횟수만 주 1회로 줄여줘',{now:'한국시간',request:async()=>({id:'bad',model:'gpt-4.1',usage:{input_tokens:1,output_tokens:1},output:[{type:'function_call',name:'revise_goal',call_id:'c',arguments:JSON.stringify({edits:[{...edit('targetMetric',null,'횟수만 주 1회',-1),text:'잘못된 변경'}]})}]})})
 assert.deepEqual(result.state.goal_card,base)
 assert.match(result.assistant_message,/실행량과 완료 기준을 아직 맞추지/)
 assert.doesNotMatch(result.assistant_message,/연결|확정했어요/)
 assert.ok(result.events.some(e=>e.tool==='draft_validation_exhausted'))
})
