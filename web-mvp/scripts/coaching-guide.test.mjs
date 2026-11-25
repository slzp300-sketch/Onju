import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { goalSchema, materializeGoalDraft, validGoalCard } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goal.ts'
import { initialGoalMessage } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalExecution.ts'
import { reviseGoal } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalRevision.ts'
import { loadState, runAgentTurn } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'
import { createOpenAiResponsesAdapter } from '../../logs/sites/onju-web-mvp/supabase/functions/_shared/openAiResponsesAdapter.ts'
import { LlmProviderTransportError } from '../../logs/sites/onju-web-mvp/supabase/functions/_shared/llmGateway.ts'
import { effortPolicy } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalEffort.ts'
import { coachingGuideIssue } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/coachingGuide.ts'

// Invented reading example, not the private reference transcript. These are
// deterministic plumbing checks; never evidence of live conversational quality.
const guide = {
  rationale:'읽기 속도가 느리다고 알려주셔서 읽은 양보다 이해한 내용을 확인하는 구성입니다.',
  progression:'첫 주에는 읽는 속도와 집중을 관찰하고, 다음 주에는 실제 기록을 기준으로 읽을 범위를 정합니다.',
  tracking:'읽은 범위 · 설명할 수 있는 내용 · 걸린 시간을 남겨 주세요. 예: 1장 / 핵심 한 문장 / 집중이 어려웠음.',
  adjustment:'내용을 설명하기 어려우면 범위를 줄이고 다시 정리합니다. 쉽게 이해되면 같은 시간 안에서 다음 구간을 읽습니다.',
  recovery:'하루 놓쳤다면 다음 회차에 밀린 양을 몰아 읽지 않고 마지막으로 이해한 구간부터 이어갑니다.',
}
const proposal = () => ({
  category:'자기계발·공부',outcome:'책 한 권의 핵심을 설명하기',identity:'',cue:'',environment:'집',deadline:'',
  baselineMetric:'현재 첫 장까지 읽음',targetMetric:'책 한 권 완독',durationWeeks:4,measurement:'custom_outcome',completionPercent:null,reviewEveryWeeks:1,
  progressStrategy:'첫 주 읽은 양과 이해도를 기록한 뒤 다음 주 읽을 범위를 다시 조정합니다.',coachingGuide:structuredClone(guide),
  planningEvidence:[{area:'독서',field:'resources',status:'known',evidence:'읽을 책이 있어'}],
  actions:[{title:'책 읽고 요점 정리',frequencyPerWeek:3,durationMinutes:20,preferredDays:[],planningStyle:'repeat',
    completionCriterion:'읽은 구간의 핵심 한 문장 기록',minimumAction:'책 한 문장 읽기',minimumMinutes:1,goalResult:'책 한 권 완독',
    conditionalRules:[],stepMinutes:[2,12,3,3],steps:['지난번 표시한 문장과 기억나는 내용을 확인합니다.','새 구간을 읽고 이해가 안 되는 단어를 표시합니다.','책을 덮고 핵심을 자신의 말로 적습니다.','막힌 부분만 다시 확인하고 다음 시작 지점을 표시합니다.']}],
})
const agreed = () => loadState({stage:5,messages:[{id:'resource',role:'user',text:'읽을 책이 있어'}],agent_v2_context:{brief:{period:{label:'4주',weeks:4},areas:['독서'],
  baselines:[{area:'독서',current:'현재 첫 장까지 읽음',status:'known'}],objectives:[{area:'독서',result:'책 한 권 완독'}],
  capacity:{summary:'주 3회 20분 가능',status:'known'}}}})
const respond = card => ({focus:'goals',intent:'seek_advice',move:'suggest',confidence:'high',expects_reply:true,
  open_threads:[],remember:[],forget:[],goal_outcome:'책 한 권 완독',goal_draft:card,paragraphs:['상세 설명은 카드와 같은 자료로 보여드립니다.'],bullets:[],question:'',choices:[]})

test('natural logging examples do not require a literal 예: or example marker',()=>{
  for (const tracking of [
    '읽은 쪽수와 이해한 내용을 이렇게 남겨 주세요: “12쪽 읽음, 핵심 한 문장 정리, 20분”.',
    '기록은 다음처럼 보내 주세요: 12쪽 읽음 / 한 문장 정리 / 집중이 어려웠음.',
    'After each session, log: “12 pages, one key idea, 20 minutes”.',
  ]) assert.equal(coachingGuideIssue({...guide,tracking}),null,tracking)
  assert.match(coachingGuideIssue({...guide,tracking:'읽은 분량과 이해한 내용을 다음에 기록해 주세요.'}),/tracking_example_required/)
})

test('a natural logging example reaches a pending plan in one authored response',async()=>{
  const card=proposal()
  card.coachingGuide.tracking='읽은 쪽수와 이해한 내용을 이렇게 남겨 주세요: “12쪽 읽음, 핵심 한 문장 정리, 20분”.'
  let calls=0
  const result=await runAgentTurn(agreed(),'이 조건으로 계획을 설계해줘',{now:'2026-09-17T09:00:00Z',today:'2026-09-17',request:async()=>{
    assert.equal(++calls,1,'a valid authored example must not need regeneration')
    return {id:'authored-not-live',model:'offline',output:[{type:'function_call',name:'respond',call_id:'natural-example',arguments:JSON.stringify(respond(card))}]}
  }})
  assert.equal(result.state.agent_v2_context.draft.card.execution.coachingGuide.tracking,card.coachingGuide.tracking)
  assert.ok(result.assistant_message.includes(card.coachingGuide.tracking))
  assert.equal(result.state.goal_card.weeklyActions.length,0)
})

test('execution records reach follow-up context and survive reload without changing the approved plan',async()=>{
  const card=materializeGoalDraft(proposal())
  const state=agreed();state.goal_card=card
  const user='오늘 책 12쪽 읽었고 핵심 한 문장을 적었어. 시간이 부족했어. 다음 회차는 어떻게 할까?'
  let calls=0
  const result=await runAgentTurn(state,user,{now:'2026-09-17T09:00:00Z',today:'2026-09-17',request:async body=>{
    if(++calls===1){
      assert.ok(body.tools.some(t=>t.name==='record_daily_checkin'))
      return {id:'authored-checkin',model:'offline',output:[{type:'function_call',name:'record_daily_checkin',call_id:'checkin',arguments:JSON.stringify({completed:[{action:'책 12쪽 읽고 핵심 한 문장 기록',evidence:'오늘 책 12쪽 읽었고 핵심 한 문장을 적었어'}],minimum:[],missed:[],energy:null,blocker:'시간 부족',blocker_evidence:'시간이 부족했어',adjustment:''})}]}
    }
    assert.equal(calls,2)
    assert.match(body.instructions,/12쪽/)
    assert.match(body.instructions,/시간 부족/)
    return {id:'authored-feedback',model:'offline',output:[{type:'function_call',name:'respond',call_id:'feedback',arguments:JSON.stringify({...respond(null),paragraphs:['12쪽을 읽고 핵심까지 남겼네요. 시간이 부족했으니 다음에는 같은 시간 안에서 읽는 범위를 조금 줄이고 정리 시간을 지키는 방법을 제안해요.','확정한 계획은 바꾸지 않았어요. 다음 기록을 보고 분량을 함께 조절할 수 있어요.']})}]}
  }})
  const reloaded=loadState(JSON.parse(JSON.stringify(result.state)))
  assert.deepEqual(reloaded.goal_card,card)
  assert.equal(reloaded.agent_v2_context.dailyCheckIns[0].completed[0],'책 12쪽 읽고 핵심 한 문장 기록')
  assert.equal(reloaded.agent_v2_context.dailyCheckIns[0].blocker,'시간 부족')
  assert.equal(reloaded.agent_v2_context.draft,null)
})

test('an advice-only question does not force a fabricated execution record',async()=>{
  const state=agreed();state.goal_card=materializeGoalDraft(proposal())
  let calls=0
  const result=await runAgentTurn(state,'오늘은 어떻게 읽으면 좋을까?',{now:'2026-09-17T09:00:00Z',today:'2026-09-17',request:async()=>{
    assert.equal(++calls,1)
    return {id:'authored-advice',model:'offline',output:[{type:'function_call',name:'respond',call_id:'advice',arguments:JSON.stringify({...respond(null),paragraphs:['지난번 이해한 부분을 짧게 떠올린 다음 이어 읽고, 끝에 핵심 한 문장을 남겨 보세요.'],question:''})}]}
  }})
  assert.deepEqual(result.state.agent_v2_context.dailyCheckIns,[])
  assert.deepEqual(result.state.goal_card,state.goal_card)
})

for(const user of [
  '오늘 턱걸이 5·4·3개 했고 마지막이 힘들었어. 통증은 없어. 다음에는 어떻게 하면 좋을까?',
  '오늘 책 12쪽 읽었어. 오늘 계획은 어떻게 바꾸면 좋을까?',
  '이번 주 세 번 읽었어. 주간 점검도 해줘.',
])test(`recording remains available alongside advice: ${user}`,async()=>{
  const state=agreed();state.goal_card=materializeGoalDraft(proposal())
  await assert.rejects(runAgentTurn(state,user,{now:'2026-09-17T09:00:00Z',today:'2026-09-17',request:async body=>{
    assert.ok(body.tools.some(t=>t.name==='record_daily_checkin'))
    throw Error('offline_capability_checked')
  }}),/offline_capability_checked/)
})

test('new proposal schema supports detailed methods and complete management, old cards remain readable',()=>{
  assert.ok(goalSchema.required.includes('coachingGuide'))
  assert.equal(goalSchema.properties.actions.items.properties.steps.maxItems,8)
  const card=materializeGoalDraft(proposal())
  assert.ok(validGoalCard(card))
  assert.deepEqual(card.execution.coachingGuide,guide)
  const restored=loadState({goal_card:JSON.parse(JSON.stringify(card))})
  assert.deepEqual(restored.goal_card.execution.coachingGuide,guide)
  delete card.execution.coachingGuide
  assert.ok(validGoalCard(card))
})

test('detailed guidance is rendered from persisted fields exactly once, with compact overview preserved',()=>{
  const card=materializeGoalDraft(proposal())
  const text=initialGoalMessage(card)
  for(const detail of Object.values(guide)) assert.equal(text.split(detail).length-1,1)
  for(const step of card.execution.actions[0].steps) assert.ok(text.includes(step))
  assert.ok(text.startsWith(guide.rationale))
  assert.ok(text.indexOf('이번 주 행동') < text.indexOf('기간 동안의 진행 방법'))
  assert.ok(text.endsWith('**이대로 시작할까요? 바꾸고 싶은 부분만 말씀해 주세요.**'))
  assert.doesNotMatch(initialGoalMessage(card,[],true),/이렇게 구성한 이유/)
})

test('real orchestration keeps explanation and card through approval and reload without another model call',async()=>{
  const bodies=[]
  const result=await runAgentTurn(agreed(),'이 조건으로 계획을 설계해줘',{now:'2026-09-17T04:00:00Z',today:'2026-09-17',model:'gpt-5.6-sol',fastModel:'gpt-5.6-terra',
    request:async body=>{bodies.push(body);assert.equal(bodies.length,1,'unexpected correction loop: '+JSON.stringify(body.input.filter(v=>v.type==='function_call_output')));return {id:'offline',model:body.model,output:[{type:'function_call',name:'respond',call_id:'c1',arguments:JSON.stringify(respond(proposal()))}]}}})
  const draft=result.state.agent_v2_context.draft
  assert.ok(draft)
  assert.equal(bodies[0].model,'gpt-5.6-sol')
  assert.deepEqual(draft.card.execution.coachingGuide,guide)
  assert.ok(result.assistant_message.includes(guide.adjustment))
  assert.equal(result.state.goal_card.weeklyActions.length,0)
  const approved=await runAgentTurn(loadState(JSON.parse(JSON.stringify(result.state))),'이 초안으로 시작할게요',{
    now:'2026-09-17T04:01:00Z',request:async()=>{throw Error('approval must not call a provider')}}, {draftId:draft.id})
  assert.deepEqual(approved.state.goal_card.execution.coachingGuide,guide)
  assert.equal(approved.state.agent_v2_context.draft,null)
})

test('changed execution conditions require refreshed guidance and do not mutate the accepted plan',()=>{
  const card=materializeGoalDraft(proposal()), before=structuredClone(card)
  const message='시간만 15분으로 줄여줘'
  const edit={field:'durationMinutes',actionIndex:0,number:15,text:null,days:null,evidence:'시간만 15분'}
  assert.throws(()=>reviseGoal(card,[edit],message),/revised_coaching_guide_required/)
  const fresh={...guide,rationale:'가능 시간이 줄어 읽는 범위만 줄이고 이해를 확인하는 절차는 유지합니다.'}
  const next=reviseGoal(card,[edit],message,[{scope:'requested',guide:fresh,conditionalRules:[[]],steps:[['한 구간만 읽고 중요한 문장을 표시합니다.','핵심 한 문장을 남기고 다음 시작점을 표시합니다.']],stepMinutes:[[12,3]]}])
  assert.deepEqual(card,before)
  assert.equal(next.card.weeklyActions[0].durationMinutes,15)
  assert.equal(next.card.execution.coachingGuide.rationale,fresh.rationale)
  assert.equal(next.card.targetMetric,card.targetMetric)
})

test('malformed guidance fails materialization rather than silently losing explanation',()=>{
  for(const invalid of [null,{}, {...guide,tracking:''}, {...guide,recovery:'x'.repeat(501)}]) {
    assert.equal(materializeGoalDraft({...proposal(),coachingGuide:invalid}),null)
  }
})

test('body-read failures use transport semantics, never a partial success or automatic retry',async()=>{
  let calls=0
  const adapter=createOpenAiResponsesAdapter({apiKey:'offline-key',fetcher:async()=>{calls++;return {ok:true,status:200,headers:new Headers(),json:async()=>{throw Error('connection lost after headers')}}}})
  await assert.rejects(adapter.generate({model:'offline'}),LlmProviderTransportError)
  assert.equal(calls,1)
})

test('long-request timeout selection preserves request and store=false without background retention',async()=>{
  let received
  const request={model:'offline',store:false,max_output_tokens:6500}
  const adapter=createOpenAiResponsesAdapter({apiKey:'offline-key',timeoutMs:input=>{assert.equal(input,request);return 90_000},fetcher:async(_url,init)=>{
    received=JSON.parse(init.body);return new Response(JSON.stringify({status:'completed',output:[]}))
  }})
  await adapter.generate(request)
  assert.deepEqual(received,request)
  assert.equal(received.background,undefined)
})

test('restored capacity outranks default 15-minute start even without old chat text',()=>{
  const policy=effortPolicy([],[],[],{summary:'주 3회 30분 가능',status:'known'})
  assert.equal(policy.perSession,30)
  assert.equal(policy.weekly,90)
  assert.equal(policy.frequency,3)
  assert.equal(policy.defaultStart,false)
})

test('goal resource and safety answers do not force a time-map write from an earlier schedule mention',async()=>{
  const state=agreed()
  state.messages=[{id:'prior',role:'assistant',text:'일정이 유동적이어도 괜찮아요. 목표 기간과 가능한 시간, 사용할 자료, 피해야 할 상황을 알려주세요.'}]
  await assert.rejects(runAgentTurn(state,'기간은 4주야. 주 3회 한 번에 20분 가능하고 읽을 책이 있어. 피해야 할 상황은 없어. 계획과 이유를 설명해줘',{
    now:'2026-09-17T04:00:00Z',today:'2026-09-17',request:async body=>{
      assert.ok(body.tools.some(t=>t.name==='record_goal_brief'))
      assert.ok(!body.tools.some(t=>t.name==='apply_schedule'))
      throw Error('offline-inspected')
    },
  }),/offline-inspected/)
})

test('related duration changes cannot reuse a guide bound to the old period',()=>{
  const card=materializeGoalDraft(proposal())
  card.execution.reviewEveryWeeks=4
  const edit={field:'durationWeeks',actionIndex:-1,number:2,text:null,days:null,evidence:'기간 2주'}
  const refresh={scope:'requested',guide,conditionalRules:[[]],steps:[card.execution.actions[0].steps],stepMinutes:[card.execution.actions[0].stepMinutes]}
  assert.throws(()=>reviseGoal(card,[edit],'기간 2주로 바꿔줘',[refresh]),/revised_coaching_guide_required:related/)
  const updated={...guide,adjustment:'2주 안에 기록을 점검해 이해하기 어려운 경우 같은 시간 안에서 읽는 범위를 줄이고 목표 분량을 다시 상의합니다.'}
  const next=reviseGoal(card,[edit],'기간 2주로 바꿔줘',[refresh,{scope:'related',guide:updated,conditionalRules:[[]],steps:refresh.steps,stepMinutes:refresh.stepMinutes}])
  assert.equal(next.related.card.execution.reviewEveryWeeks,2)
  assert.equal(next.related.card.execution.coachingGuide.adjustment,updated.adjustment)
  assert.equal(card.durationWeeks,4)
})

test('rejected guide cannot escape as final text or a pending draft before repair',async()=>{
  let calls=0
  const result=await runAgentTurn(agreed(),'이 조건으로 계획을 설계해줘',{now:'2026-09-17T04:00:00Z',today:'2026-09-17',request:async body=>{
    calls++
    const card=proposal()
    if(calls===1)card.coachingGuide.tracking='운동 체크 알림을 설정했어요. 정해진 시간에 보내요. 예: 오늘 완료.'
    else {
      assert.equal(calls,2)
      assert.match(JSON.stringify(body.input),/unsupported_reminder_claim/)
      assert.match(body.instructions,/"pendingDraft":null/)
    }
    return {id:'offline-'+calls,model:'offline',output:[{type:'function_call',name:'respond',call_id:'c'+calls,arguments:JSON.stringify(respond(card))}]}
  }})
  assert.equal(calls,2)
  assert.equal(result.state.agent_v2_context.draft.card.execution.coachingGuide.tracking,guide.tracking)
  assert.doesNotMatch(result.assistant_message,/알림을 설정했어요/)
})
