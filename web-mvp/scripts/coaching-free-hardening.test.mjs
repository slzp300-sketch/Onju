import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseGoalCapacity } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacity.ts'
import { knownGoalValueHasEvidence } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalIntakeEvidence.ts'
import { loadState, runAgentTurn } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'
import { formatReply } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/state.ts'
import { publicWorkflow } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/workflowState.ts'
import { routeConversation } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/router.ts'
import { selectAgentTasks } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/taskRegistry.ts'
import { createOpenAiResponsesAdapter } from '../../logs/sites/onju-web-mvp/supabase/functions/_shared/openAiResponsesAdapter.ts'
import { LlmProviderTransportError, safeProviderDiagnostic } from '../../logs/sites/onju-web-mvp/supabase/functions/_shared/llmGateway.ts'
import { bindAiCostContext, budgetedGenerate } from '../../logs/sites/onju-web-mvp/supabase/functions/_shared/webMvpCostControl.ts'

// Generated examples and injected responses only. This suite proves plumbing,
// not that a live model produces reference-level coaching.
for (const count of [1,2,3,5]) for (const minutes of [10,20,30,45]) {
  test(`equivalent per-session wording preserves ${count} weekly sessions of ${minutes} minutes`,()=>{
    const evidence=`주 ${count}회 한 번에 ${minutes}분씩 가능해.`
    const expected=parseGoalCapacity(evidence)
    assert.equal(expected.weeklyMinutes.max,count*minutes)
    for(const summary of [`주 ${count}회, 1회 ${minutes}분 가능`, `주 ${count}회 1회 ${minutes}분`,
      `주 ${count}회 회당 ${minutes}분`,`${count} sessions of ${minutes} minutes per week`]) {
      assert.deepEqual(parseGoalCapacity(summary),expected,summary)
      assert.ok(knownGoalValueHasEvidence(evidence,evidence,summary,'capacity'),summary)
    }
    assert.equal(knownGoalValueHasEvidence(evidence,evidence,`주 ${count+1}회, 1회 ${minutes}분 가능`,'capacity'),false)
    assert.equal(knownGoalValueHasEvidence(evidence,evidence,`주 ${count}회, 1회 ${minutes+5}분 가능`,'capacity'),false)
  })
}

test('per-session normalization never manufactures a weekly frequency or overrides a total',()=>{
  const single=parseGoalCapacity('1회 30분')
  assert.equal(single.weeklyMinutes,null)
  assert.equal(single.weeklySessions,null)
  assert.equal(single.perSessionMinutes.max,30)
  for(const text of ['주 1회 30분','일주일에 1회 30분','매주 1회 30분']) {
    assert.equal(parseGoalCapacity(text).weeklySessions.max,1,text)
    assert.equal(parseGoalCapacity(text).weeklyMinutes.max,30,text)
  }
  const evidence='주 3회 총 30분 가능'
  assert.equal(knownGoalValueHasEvidence(evidence,evidence,'주 3회 1회 30분','capacity'),false)
  assert.equal(parseGoalCapacity('주 3회 총 1회 30분').status,'unresolved')
})

const now='2026-09-17T09:00:00Z'
const state=()=>loadState({stage:5,agent_v2_context:{brief:{period:{label:'4주',weeks:4},areas:['독서'],
  baselines:[{area:'독서',current:'첫 장까지 읽음',status:'known'}],objectives:[{area:'독서',result:'책 한 권 완독'}],capacity:null}}})
const reply=(question)=>({paragraphs:['읽는 시간은 확인했어요. 사용할 자료에 맞춰 읽는 방법을 정할게요.'],bullets:[],question,choices:[],remember:[],forget:[]})
const capture=(question)=>({period:null,areas:[],area_changes:[],baselines:[],objectives:[],priority:null,
  capacity:{summary:'주 3회, 1회 20분 가능',evidence:'주 3회 한 번에 20분씩 가능해.',status:'known'},feasibility_acceptance:null,reply:reply(question)})
const output=(name,args,id)=>({id:'offline-'+id,model:'gpt-5.6-terra',output:[{type:'function_call',name,call_id:'c'+id,arguments:JSON.stringify(args)}]})

test('capture keeps a domain clarification after the last generic field, with no extra paid response step',async()=>{
  const question='1. **자료**: 어떤 책으로 진행하실 건가요?\n2. **환경**: 소리 내서 읽을 수 있는 환경인가요?'
  const bodies=[]
  const result=await runAgentTurn(state(),'주 3회 한 번에 20분씩 가능해.',{now,today:'2026-09-17',request:async body=>{
    bodies.push(body); assert.equal(bodies.length,1,'must not discard the question and call a draft model')
    return output('record_goal_brief',capture(question),1)
  }})
  assert.equal(result.state.agent_v2_context.brief.capacity.summary,'주 3회, 1회 20분 가능')
  assert.ok(result.assistant_message.includes(question))
  assert.equal(result.state.agent_v2_context.draft,null)
  assert.equal(result.state.goal_card.weeklyActions.length,0)
  const restored=loadState(JSON.parse(JSON.stringify(result.state)))
  assert.match(publicWorkflow(restored.agent_v2_context.workflow).openItem.text,/자료.*환경/)
  let calls=0
  await runAgentTurn(restored,'에세이 책이고 조용히 읽어야 해.',{now,request:async body=>{
    calls++
    assert.match(JSON.stringify(body),/소리 내서 읽을 수 있는 환경/)
    assert.match(JSON.stringify(body),/조용히 읽어야/)
    return output('respond',{...reply(''),paragraphs:['소리 내지 않고 읽는 조건으로 맞출게요.'],focus:'goals',intent:'seek_advice',move:'answer',confidence:'high',expects_reply:false,open_threads:[],goal_outcome:'',goal_draft:null},2)
  }})
  assert.equal(calls,1)
})

test('a capture acknowledgement without a question still proceeds to the response/plan path',async()=>{
  let calls=0
  const result=await runAgentTurn(state(),'주 3회 한 번에 20분씩 가능해.',{now,request:async()=>{
    calls++
    assert.ok(calls<=2)
    return calls===1?output('record_goal_brief',capture(''),1):output('respond',{
      ...reply('책의 분량을 알려주실 수 있나요?'),focus:'goals',intent:'explore',move:'ask',confidence:'high',expects_reply:true,open_threads:[],goal_outcome:'',goal_draft:null},2)
  }})
  assert.equal(calls,2)
  assert.match(result.assistant_message,/책의 분량/)
})

test('grouped questions preserve label emphasis rather than bolding whole sentences',()=>{
  const question='1. **기간**: 언제까지 진행할까요?\n2. **현재 상태**: 어디까지 진행했나요?'
  assert.ok(formatReply(reply(question)).text.endsWith(question))
  assert.ok(formatReply(reply('언제 시작할까요?')).text.endsWith('**언제 시작할까요?**'))
  const long='계획을 더 정확히 맞추기 위해 '+ '현재 사용하는 자료와 환경을 알려 주세요. '.repeat(7)+'가능한가요?'
  assert.ok(formatReply(reply(long)).text.endsWith(long))
  assert.doesNotMatch(formatReply(reply(long)).text,/\*\*/)
})

test('personal plan explanations keep goal workflow and detailed steps, but term questions keep knowledge access',()=>{
  const common={focus:'goals',hasConfirmedGoal:false,expectedStateTools:['record_goal_brief']}
  for(const userText of ['이 조건으로 계획과 실행 방법, 이유, 기록하면서 조정하는 방법까지 설명해줘.',
    '내 계획에 맞는 관리 방법을 설명해줘']) {
    const route=routeConversation({...common,userText})
    assert.equal(route.primary,'goal')
    assert.ok(!route.modules.includes('knowledge'))
    const tasks=selectAgentTasks({route,userText,goalFactsProvided:true,goalReadyForDraft:true})
    assert.ok(!tasks.some(t=>t.id==='T11'))
    const design=tasks.find(t=>t.id==='T04')
    assert.match(design.instructions,/2~8단계/)
    assert.match(design.instructions,/coachingGuide/)
    assert.doesNotMatch(design.instructions,/2~3단계/)
  }
  for(const userText of ['신디가 무슨 뜻인지 설명해줘','이 조건으로 계획을 만들기 전에 운동 용어부터 설명해줘']) {
    const route=routeConversation({...common,userText,expectedStateTools:[]})
    assert.equal(route.primary,'knowledge')
    assert.ok(route.allowedTools.includes('lookup_term'))
  }
})

for(const [name,cause,kind] of [
  ['timeout',new DOMException('private payload','TimeoutError'),'timeout'],
  ['cancel',new DOMException('private payload','AbortError'),'cancelled'],
  ['network',new TypeError('private payload'),'network'],
  ['json',new SyntaxError('private payload'),'invalid_json'],
]) test(`provider ${name} retains safe diagnostics, not payloads, without retry`,async()=>{
  let calls=0
  const adapter=createOpenAiResponsesAdapter({apiKey:'private-key',createRequestId:()=> 'client_test',timeoutMs:90000,fetcher:async()=>{
    calls++
    if(name==='network')throw cause
    return {ok:true,status:200,headers:new Headers({'x-request-id':'req_test'}),json:async()=>{throw cause}}
  }})
  await assert.rejects(adapter.generate({model:'offline',input:'private input'}),error=>{
    assert.ok(error instanceof LlmProviderTransportError)
    assert.equal(error.diagnostic.kind,kind)
    assert.equal(error.diagnostic.phase,name==='network'?'request':'body')
    assert.equal(error.diagnostic.requestId,'client_test')
    assert.equal(error.diagnostic.providerRequestId,name==='network'?undefined:'req_test')
    assert.equal(error.diagnostic.timeoutMs,90000)
    assert.doesNotMatch(JSON.stringify(error),/private/)
    return true
  })
  assert.equal(calls,1)
})

test('malformed success envelopes cannot become a completed provider response',async()=>{
  for(const body of [null,[],42,'not an object']) {
    const adapter=createOpenAiResponsesAdapter({apiKey:'offline',fetcher:async()=>new Response(JSON.stringify(body))})
    await assert.rejects(adapter.generate({}),error=>error.diagnostic.kind==='invalid_json')
  }
})

test('HTTP and incomplete results retain codes/status without leaking response body',async()=>{
  const adapter=createOpenAiResponsesAdapter({apiKey:'offline',fetcher:async()=>new Response(JSON.stringify({error:{code:'server_error',message:'private diagnostic'}}),{status:503,headers:{'x-request-id':'req_http'}})})
  const result=await adapter.generate({})
  assert.equal(result.diagnostic.kind,'http')
  assert.equal(result.diagnostic.status,503)
  assert.equal(result.errorCode,'server_error')
  assert.doesNotMatch(JSON.stringify(result),/private diagnostic/)
  const incomplete=createOpenAiResponsesAdapter({apiKey:'offline',fetcher:async()=>new Response(JSON.stringify({status:'incomplete',usage:{input_tokens:1,output_tokens:2}}))})
  assert.equal((await incomplete.generate({})).diagnostic.kind,'incomplete')
})

test('diagnostic logging is allowlisted and cost-unknown blocks retries even if logging fails',async()=>{
  const oldDeno=globalThis.Deno, oldWarn=console.warn
  globalThis.Deno={env:{get:()=>undefined}}
  try {
    for(const loggerFails of [false,true]) {
      const logs=[],settlements=[]
      console.warn=value=>{logs.push(value); if(loggerFails)throw Error('log offline')}
      const db={rpc:async(name,args)=>{
        if(name==='web_mvp_begin_ai_call')return {data:{state:'reserved',id:'r1'},error:null}
        settlements.push(args);return {data:true,error:null}
      }}
      bindAiCostContext(db,'not-logged-session','test',{message:'private prompt',turnId:'t1'})
      let calls=0
      const generate=async()=>{
        calls++
        throw new LlmProviderTransportError('openai',new Error('private secret'),{kind:'network',phase:'body',requestId:'client_1',providerRequestId:'req_1',status:200,elapsedMs:13200})
      }
      for(let i=0;i<2;i++)await assert.rejects(budgetedGenerate(db,{model:'gpt-5.6-sol',max_output_tokens:6500},generate),/ai_outcome_unknown/)
      assert.equal(calls,1)
      assert.equal(settlements[0].p_state,'unknown')
      assert.equal(settlements[0].p_actual,null)
      assert.equal(settlements[0].p_response,null)
      assert.equal(logs.length,1)
      assert.equal(JSON.parse(logs[0]).providerRequestId,'req_1')
      assert.doesNotMatch(logs[0],/private|not-logged-session/)
    }
    const safe=safeProviderDiagnostic({kind:'private message',phase:'private input',requestId:'Bearer secret',providerRequestId:'bad\nheader',elapsedMs:Infinity,status:999,extra:'private'})
    assert.equal(safe.kind,'unknown')
    assert.equal(safe.requestId,undefined)
    assert.doesNotMatch(JSON.stringify(safe),/private|secret|header/)
  } finally {console.warn=oldWarn;globalThis.Deno=oldDeno}
})
