import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {loadState,runAgentTurn} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'
import {splitQuestions,resolveCoachingQuestions,resolveSupportedQuestionUpdates,rememberAskedQuestions,omitResolvedQuestions} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/coachingQuestions.ts'
import {planningRequirements,planningEvidenceIssue} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/planningReadiness.ts'
import {coachingGuideIssue} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/coachingGuide.ts'
const question='1. **기간**: 몇 주 동안 할까요?\n2. **장비**: 어떤 장비가 있나요?\n3. **제약**: 피해야 할 동작이 있나요?'
test('partial answers survive independent updates and reload; unknown is not no constraint',()=>{
  const items=rememberAskedQuestions([],question)
  const updates=[{id:items[0].id,status:'answered',evidence:'8주'}, {id:items[2].id,status:'unknown',evidence:'피해야 할 동작은 잘 모르겠어'}]
  const next=resolveCoachingQuestions(items,updates,'8주. 피해야 할 동작은 잘 모르겠어')
  assert.deepEqual(next.map(q=>q.status),['answered','open','unknown'])
  assert.equal(omitResolvedQuestions(question,next),splitQuestions(question)[1])
  assert.deepEqual(loadState({agent_v2_context:{coachingQuestions:next}}).agent_v2_context.coachingQuestions,next)
  assert.deepEqual(items.map(q=>q.status),['open','open','open'])
  assert.deepEqual(resolveCoachingQuestions(next,[],'다른 이야기부터 하자'),next)
})
test('invalid ids, invented evidence, duplicate updates cannot mutate the ledger',()=>{
  const items=rememberAskedQuestions([],question)
  const valid={id:items[0].id,status:'answered',evidence:'8주'}
  for(const updates of [[{...valid,id:'invented'}],[{...valid,evidence:'12주'}],[valid,valid]]) {
    assert.throws(()=>resolveCoachingQuestions(items,updates,'8주'),/question_resolution_requires/)
    assert.ok(items.every(q=>q.status==='open'))
  }
})
test('numbering changes do not re-open a refused question',()=>{
  const items=rememberAskedQuestions([],question)
  const resolved=resolveCoachingQuestions(items,[{id:items[1].id,status:'declined',evidence:'장비 질문은 답하지 않을게'}],'장비 질문은 답하지 않을게')
  assert.equal(omitResolvedQuestions('1. **장비**: 어떤 장비가 있나요?',resolved),'')
})
test('headers are not questions; questions before a trailing standalone question are retained',()=>{
  const text='아래 번호대로 편하게 답해주세요.\n'+question+'\n\n마지막 숫자는 무엇을 뜻하나요?'
  const items=splitQuestions(text)
  assert.equal(items.length,4)
  assert.ok(items[0].startsWith('1.'))
  assert.match(items[3],/마지막 숫자/)
})
test('a home preference does not answer a combined equipment and time question',()=>{
  const questions=rememberAskedQuestions([],'주 몇 회 가능하며 장소·장비는 무엇인가요?')
  const next=resolveCoachingQuestions(questions,[{id:questions[0].id,status:'answered',evidence:'체육관보다는 집에서 하는 게 좋아'}],'체육관보다는 집에서 하는 게 좋아')
  assert.equal(next[0].status,'partial')
  assert.ok(omitResolvedQuestions(questions[0].text,next))
})
test('invalid ancillary question updates are ignored independently and cannot lose valid siblings',()=>{
  const questions=rememberAskedQuestions([],question)
  const updates=[{id:'wrong-id',status:'answered',evidence:'8주'},{id:questions[0].id,status:'answered',evidence:'8주'}, {id:questions[1].id,status:'unknown',evidence:'이전 발언'}]
  const next=resolveSupportedQuestionUpdates(questions,updates,'8주')
  assert.deepEqual(next.map(q=>q.status),['answered','open','open'])
})
test('unnumbered grouped questions remain independently answerable',()=>{
  const questions=rememberAskedQuestions([],'어떤 장비가 있나요?\n피해야 할 동작이 있나요?\n주 몇 회 가능한가요?')
  assert.equal(questions.length,3)
  const next=resolveCoachingQuestions(questions,[{id:questions[0].id,status:'answered',evidence:'장비는 없어'}],'장비는 없어')
  assert.deepEqual(next.map(q=>q.status),['answered','open','open'])
})
test('silence or unrelated replies cannot be relabeled as unknown or declined',()=>{
  const questions=rememberAskedQuestions([],question)
  for(const status of ['unknown','declined']) {
    const updates=[{id:questions[1].id,status,evidence:'8주'}]
    assert.throws(()=>resolveCoachingQuestions(questions,updates,'8주'),/requires_explicit_evidence/)
    assert.deepEqual(resolveSupportedQuestionUpdates(questions,updates,'8주'),questions)
  }
})
const brief={areas:['운동'],objectives:[{area:'운동',result:'턱걸이 12개'}]}
const evidence=[
  {area:'운동',field:'environment',status:'known',evidence:'집에서 할게'},
  {area:'운동',field:'resources',status:'known',evidence:'집에 철봉과 매트가 있어'},
  {area:'운동',field:'limitations',status:'none',evidence:'통증이나 피해야 할 동작은 없어'},
]
const sources=evidence.map(e=>e.evidence)
test('domain registry requires environment, actual resources and limitations without requiring body measurements',()=>{
  assert.deepEqual(planningRequirements(brief).map(r=>r.field),['environment','resources','limitations'])
  assert.equal(planningEvidenceIssue(evidence,brief,sources),null)
  assert.match(planningEvidenceIssue(evidence.slice(0,2),brief,sources),/unresolved/)
  assert.match(planningEvidenceIssue(undefined,brief,sources),/missing/)
  assert.deepEqual(planningRequirements({areas:['직장 프로젝트'],objectives:[]}),[])
  assert.deepEqual(planningRequirements({areas:['독서'],objectives:[]}),[])
})
test('ability cannot prove equipment; unknown/declined cannot be treated as cleared safety',()=>{
  const ability={...evidence[1],evidence:'턱걸이 10개 가능해'}
  assert.match(planningEvidenceIssue([evidence[0],ability,evidence[2]],brief,[...sources,ability.evidence]),/wrong_scope/)
  for(const status of ['unknown','declined']) {
    const item={...evidence[2],status,evidence:'피해야 할 동작은 모르겠어'}
    assert.match(planningEvidenceIssue([evidence[0],evidence[1],item],brief,[...sources,item.evidence]),/unresolved/)
  }
  const invented={...evidence[1],evidence:'덤벨을 보유해'}
  assert.match(planningEvidenceIssue([evidence[0],invented,evidence[2]],brief,sources),/not_grounded/)
})
test('guide lint rejects duplicate filler and requires a conditional action plus a usable record example',()=>{
  const guide={rationale:'현재 조건에 맞춘 구성이에요.',progression:'완료 증거가 쌓이면 다음 단계로 가요.',tracking:'예: 완료한 범위 / 어려운 점',adjustment:'어려우면 범위를 줄이고 같은 시간 안에서 반복합니다.',recovery:'놓쳤다면 다음 회차에 작은 단위로 이어갑니다.'}
  assert.equal(coachingGuideIssue(guide),null)
  assert.match(coachingGuideIssue({...guide,adjustment:'기록을 보고 잘 조정해 드릴게요.'}),/not_actionable/)
  assert.match(coachingGuideIssue({...guide,tracking:'실행 결과를 기록해 주세요.'}),/example_required/)
  assert.match(coachingGuideIssue({...guide,progression:guide.rationale}),/repeated_content/)
})
test('personal evidence excludes other people and hypotheticals; an evidenced short answer binds to its actual question',()=>{
  for(const source of ['친구는 집에 철봉과 매트가 있어','만약 집에 철봉과 매트가 있어도 괜찮을까?']) {
    assert.match(planningEvidenceIssue(evidence,brief,[sources[0],source,sources[2]]),/not_current_personal_fact/)
  }
  const answer={...evidence[2],evidence:'없어'}
  assert.match(planningEvidenceIssue([evidence[0],evidence[1],answer],brief,[...sources,'없어']),/wrong_scope/)
  assert.equal(planningEvidenceIssue([evidence[0],evidence[1],answer],brief,[...sources,'없어'],[{id:'q',text:'통증이나 피해야 할 동작이 있나요?',status:'answered',evidence:'없어'}]),null)
})
test('server prevents a premature physical plan even when the five generic fields are complete',async()=>{
  const state=loadState({stage:5,agent_v2_context:{brief:{period:{label:'4주',weeks:4},areas:['운동'],baselines:[{area:'운동',current:'턱걸이 8개',status:'known'}],objectives:[{area:'운동',result:'턱걸이 10개'}],capacity:{summary:'주 2회 20분 가능',status:'known'}}}})
  const card={...state.goal_card,category:'운동',outcome:'턱걸이 10개',targetMetric:'턱걸이 10개',durationWeeks:4,weeklyActions:[{title:'턱걸이 연습',frequencyPerWeek:2,durationMinutes:20,preferredDays:[]}]}
  let calls=0
  const result=await runAgentTurn(state,'이 조건으로 계획을 설계해줘',{now:'2026-09-17T04:00:00Z',request:async body=>{
    calls++
    assert.ok(calls<=2)
    if(calls===2) {
      assert.match(JSON.stringify(body.input),/planning_conditions_missing/)
      assert.match(body.instructions,/"pendingDraft":null/)
    }
    const args={focus:'goals',intent:'seek_advice',move:'ask',confidence:'high',expects_reply:true,open_threads:[],remember:[],forget:[],goal_outcome:'',goal_draft:calls===1?card:null,paragraphs:['장비와 피해야 할 동작에 따라 운동 구성이 달라져요.'],bullets:[],question:'운동할 환경과 장비, 피해야 할 동작을 알려 주실래요?',choices:[]}
    return {id:'offline'+calls,model:'offline',output:[{type:'function_call',name:'respond',call_id:'c'+calls,arguments:JSON.stringify(args)}]}
  }})
  assert.equal(calls,2)
  assert.equal(result.state.agent_v2_context.draft,null)
  assert.deepEqual(result.state.goal_card,state.goal_card)
})
test('real capture removes answered period only, keeps resource question and independent open status',async()=>{
  const state=loadState({stage:5,messages:[{id:'q',role:'assistant',text:question}],agent_v2_context:{coachingQuestions:rememberAskedQuestions([],question)}})
  let calls=0
  const result=await runAgentTurn(state,'8주로 할게',{now:'2026-09-17T04:00:00Z',request:async()=>{
    calls++;assert.equal(calls,1)
    return {id:'offline',model:'offline',output:[{type:'function_call',name:'record_goal_brief',call_id:'c1',arguments:JSON.stringify({period:null,areas:[],area_changes:[],baselines:[],objectives:[],priority:null,capacity:null,feasibility_acceptance:null,reply:{paragraphs:['기간을 확인했어요.'],bullets:[],question,choices:[],remember:[],forget:[],question_updates:[{id:state.agent_v2_context.coachingQuestions[0].id,status:'answered',evidence:'8주'}]}})}]}
  }})
  assert.match(result.assistant_message,/어떤 장비/)
  assert.doesNotMatch(result.assistant_message,/몇 주 동안/)
  assert.equal(result.state.agent_v2_context.coachingQuestions.find(q=>q.text.includes('장비')).status,'open')
})
