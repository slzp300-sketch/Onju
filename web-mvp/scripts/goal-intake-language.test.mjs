// Real local Site validation/agent code; provider responses below are fixtures,
// not live model replies. The network guard makes this test non-billable.
import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyBrief, updateGoalBrief, loadGoalBrief, missingGoalBrief, parseGoalPeriod } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import { explicitlyUnknownGoalEvidence, hasCapacityMeaning } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalIntakeEvidence.ts'
import { loadState, runAgentTurn } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'
import { englishGoalIntakeQuestionMatches, englishGoalIntakeQuestion } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalIntakeLanguage.ts'

const us = { locale:'en-US', countryCode:'US', timeZone:'America/New_York', currencyCode:'USD', weekStartsOn:0 }
const period = { evidence:'8 weeks', kind:'duration', normalized:'8주' }
const baseline = (evidence, status='known') => ({ area:'reading', current:evidence, evidence, status })
const capacity = (evidence, status='known') => ({ summary:evidence, evidence, status })
const seed = () => ({ ...emptyBrief(), period:{label:'8 weeks',weeks:8}, areas:['reading'],
  objectives:[{area:'reading',result:'read 2 books',evidence:'read 2 books',resultKind:'metric'}] })
const call = (args, question='How much time can you comfortably spend on this each week?') => ['record_goal_brief', {
  period:null,areas:[],baselines:[],objectives:[],capacity:null,...args,
  reply:{paragraphs:['We can base the plan on what you have shared.'],bullets:[],question,choices:[]},
}]
function mockProvider(sequence, routeEvidence) {
  if(routeEvidence) sequence=[['route_request',{module:'goal',evidence:routeEvidence}],...sequence]
  let calls=0
  const requests=[]
  return { now:'September 16, 2026',today:'2026-09-16',regionalContext:us,requests,
    request:async body => {
      requests.push(structuredClone(body))
      assert.ok(calls<sequence.length,'Unexpected extra model request: '+JSON.stringify(body.input?.filter(item=>item.type==='function_call_output')))
      const [name,args]=sequence[calls++]
      return {id:`mock-${calls}`,model:'offline-fixture',usage:{input_tokens:0,output_tokens:0},output:[{
        type:'function_call',name,arguments:JSON.stringify(args),call_id:`call-${calls}`,
      }]}
    },
  }
}
const session = brief => loadState({stage:5,agent_v2_context:{brief}})

test('stored normalized periods preserve exact user labels and deadlines through repeated reloads', () => {
  for(const value of [
    {label:'8 weeks',weeks:8}, {label:'until the end of my course',weeks:15,deadline:'2026-12-31'},
    {label:'두 달 정도로 정할게',weeks:9},
  ]) {
    let state={...emptyBrief(),period:value}
    for(let turn=0;turn<4;turn++) state=loadGoalBrief(JSON.parse(JSON.stringify(state)))
    assert.deepEqual(state.period,value)
    assert.deepEqual(loadState({agent_v2_context:{brief:state}}).agent_v2_context.brief.period,value)
  }
})

test('malformed normalized state fails closed instead of silently reparsing the label', () => {
  for(const value of [
    {label:'8주',weeks:0}, {label:'8주',weeks:105}, {label:'8주',weeks:2.5}, {label:'8주',weeks:'8'},
    {label:'8주',weeks:8,deadline:'2026-02-30'}, {label:'8주',weeks:8,deadline:123},
    {label:'',weeks:8}, {label:'x'.repeat(181),weeks:8},
  ]) assert.equal(loadGoalBrief({...emptyBrief(),period:value}).period,null)
  assert.deepEqual(loadGoalBrief({...emptyBrief(),period:{label:'8주'}}).period,{label:'8주',weeks:8})
  assert.deepEqual(parseGoalPeriod('8 WEEKS'),{label:'8 WEEKS',weeks:8})
  for(const text of ['0 days','0일','8-12 weeks','3 years']) assert.equal(parseGoalPeriod(text),null)
  const longEvidence='8 weeks '+'.'.repeat(180)
  assert.throws(()=>updateGoalBrief(emptyBrief(),{period:{...period,evidence:longEvidence}},longEvidence),/exact_user_evidence/)
})

test('unmeasured English accepts explicit uncertainty, not already measured statements', () => {
  for(const evidence of ['I have never measured my current level.', 'I haven’t tracked it.', 'I do not know my level.', 'unmeasured']) {
    assert.equal(explicitlyUnknownGoalEvidence(evidence),true)
    assert.equal(updateGoalBrief(seed(),{baselines:[baseline(evidence,'unmeasured')]},evidence).baselines[0].status,'unmeasured')
  }
  for(const evidence of ['I have measured my current level.', 'I know my level.', 'My level is not unknown.']) {
    assert.equal(explicitlyUnknownGoalEvidence(evidence),false)
    assert.throws(()=>updateGoalBrief(seed(),{baselines:[baseline(evidence,'unmeasured')]},evidence),/baseline_not_decided/)
  }
})

test('variable capacity is accepted, without treating unknown baseline as spare time', () => {
  const evidence='My schedule changes every week and my available time varies.'
  assert.equal(hasCapacityMeaning(evidence),true)
  assert.equal(updateGoalBrief(seed(),{capacity:capacity(evidence,'unmeasured')},evidence).capacity.status,'unmeasured')
  const unknown='I have never measured my current level.'
  assert.equal(hasCapacityMeaning(unknown),false)
  assert.throws(()=>updateGoalBrief(seed(),{capacity:capacity(unknown,'unmeasured')},unknown),/capacity_requires_grounded/)
})

test('all English facts supplied together survive capture and reload', () => {
  const text='reading: read 2 books in 8 weeks. 0 books completed. I can spend 20 minutes on weekdays.'
  const args={period,areas:['reading'],objectives:[{area:'reading',result:'read 2 books',evidence:'read 2 books',result_kind:'metric'}],
    baselines:[baseline('0 books completed')],capacity:capacity('I can spend 20 minutes on weekdays.')}
  const result=updateGoalBrief(emptyBrief(),args,text)
  assert.equal(missingGoalBrief(result),null)
  assert.deepEqual(loadGoalBrief(JSON.parse(JSON.stringify(result))),result)
  assert.deepEqual(updateGoalBrief(result,args,text),result)
  assert.throws(()=>updateGoalBrief(emptyBrief(),args,'I want a plan.'),/exact_user_evidence/)
})

test('English period suggestions/questions are not confirmed by a model candidate', () => {
  for(const text of [
    'Maybe 8 weeks, but I have not decided yet.', 'Would 8 weeks work?', '8 weeks?',
    '8 weeks. I have not decided yet.', 'Not 8 weeks, but 4 weeks.', '4 weeks instead of 8 weeks.',
  ]) assert.throws(()=>updateGoalBrief(emptyBrief(),{period},text),/period_not_decided/,text)
})

test('decided period is not discarded because a separate fact is unknown or a question follows', () => {
  for(const text of ['8 weeks. I do not know my level.', '8 weeks, but I do not know my level.',
    'Not 4 weeks, but 8 weeks.', '8 weeks. Can you help me plan?']) {
    assert.equal(updateGoalBrief(emptyBrief(),{period},text).period.weeks,8,text)
  }
  assert.equal(updateGoalBrief(emptyBrief(),{period},'My current level is unknown.',['I choose 8 weeks.']).period.weeks,8)
  assert.throws(()=>updateGoalBrief(emptyBrief(),{period},'My current level is unknown.',['Maybe 8 weeks?']),/period_not_decided/)
})

test('real agent filter keeps an English unknown baseline and asks only for capacity in English', async () => {
  const evidence='I have never measured my current level.'
  const result=await runAgentTurn(session(seed()),evidence,mockProvider([call({baselines:[baseline(evidence,'unmeasured')]})],evidence))
  assert.equal(result.state.agent_v2_context.brief.baselines[0]?.status,'unmeasured')
  assert.equal(missingGoalBrief(result.state.agent_v2_context.brief),'capacity')
  assert.doesNotMatch(result.assistant_message,/[가-힣]/)
  assert.match(result.assistant_message,/How much time can you comfortably spend/)
  assert.doesNotMatch(result.state.agent_v2_context.brief.baselines[0].current,/[가-힣]/)
})

test('real agent filter captures capacity in the first English turn and does not reask it', async () => {
  const time='I can spend 20 minutes on weekdays.'
  const text='reading in 8 weeks. '+time
  const result=await runAgentTurn(session(emptyBrief()),text,mockProvider([call({period,areas:['reading'],capacity:capacity(time)},'What is your current reading level?')],text))
  const brief=result.state.agent_v2_context.brief
  assert.equal(brief.capacity.summary,time)
  assert.equal(brief.period.weeks,8)
  assert.equal(missingGoalBrief(brief),'baseline')
  assert.match(result.assistant_message,/What is your current reading level/)
  assert.doesNotMatch(result.assistant_message,/[가-힣]/)
})

test('real agent filter cannot copy unknown baseline into unrelated capacity', async () => {
  const evidence='I have never measured my current level.'
  const result=await runAgentTurn(session(seed()),evidence,mockProvider([call({
    baselines:[baseline(evidence,'unmeasured')],capacity:capacity(evidence,'unmeasured'),
  })],evidence))
  assert.equal(result.state.agent_v2_context.brief.baselines[0]?.status,'unmeasured')
  assert.equal(result.state.agent_v2_context.brief.capacity,null)
})

test('every English recovery question matches its own missing fact, not a mixed request', () => {
  for(const missing of ['period','areas','baseline','result','priority','capacity','feasibility']) {
    const question=englishGoalIntakeQuestion(seed(),missing)
    assert.doesNotMatch(question,/[가-힣]/)
    assert.equal(englishGoalIntakeQuestionMatches(missing,question),true,missing+': '+question)
  }
  assert.equal(englishGoalIntakeQuestionMatches('baseline','What is your current level and how much time can you spend?'),false)
  assert.equal(englishGoalIntakeQuestionMatches('capacity','What outcome would count as success?'),false)
})

test('real agent suppresses a resolved English period question without a canned replacement', async () => {
  const evidence='I have never measured my current level.'
  const result=await runAgentTurn(session(seed()),evidence,mockProvider([
    call({baselines:[baseline(evidence,'unmeasured')]},'How long would you like to work on this?'),
  ],evidence))
  assert.match(result.assistant_message,/We can base the plan/)
  assert.doesNotMatch(result.assistant_message,/How long|[가-힣]/)
  assert.equal(result.state.agent_v2_context.brief.period.weeks,8)
})

test('real English agent turns preserve first-turn flexible capacity after reloading state', async () => {
  const evidence='My schedule changes every week and my available time varies.'
  const text='reading for 8 weeks. '+evidence
  const first=await runAgentTurn(session(emptyBrief()),text,mockProvider([
    call({period,areas:['reading'],capacity:capacity(evidence,'unmeasured')},'What is your current reading level?'),
  ],text))
  const nextText='I have never measured my current level.'
  const second=await runAgentTurn(loadState(JSON.parse(JSON.stringify(first.state))),nextText,mockProvider([
    call({baselines:[baseline(nextText,'unmeasured')]},'What outcome would count as success?'),
  ],nextText))
  const brief=second.state.agent_v2_context.brief
  assert.equal(brief.capacity.status,'unmeasured')
  assert.equal(brief.period.weeks,8)
  assert.equal(missingGoalBrief(brief),'result')
  assert.match(second.assistant_message,/What outcome would count as success/)
  assert.doesNotMatch(second.assistant_message,/How long|How much time|[가-힣]/)
})

test('a model cannot confirm a tentative English period through the actual agent', async () => {
  const text='Maybe 8 weeks, but I have not decided yet.'
  const result=await runAgentTurn(session(emptyBrief()),text,mockProvider([
    call({period},'What is your current level?'),
    ['respond',{focus:'goals',goal_outcome:'',goal_draft:null,summary:'We can leave the duration open while you decide.',details:[],question:'What timeframe would suit you?',choices:[]}],
  ],text))
  assert.equal(result.state.agent_v2_context.brief.period,null)
  assert.equal(result.state.agent_v2_context.draft,null)
  assert.match(result.assistant_message,/What is your current level/)
  assert.doesNotMatch(result.assistant_message,/[가-힣]/)
})

test('context-only goal tools can be activated once, not repeatedly or without user evidence', async () => {
  const text='I want a reading plan.'
  const reply=['respond',{focus:'goals',goal_draft:null,goal_outcome:'',summary:'We can shape a reading plan around you.',details:[],question:'What timeframe would suit you?',choices:[]}]
  const invalid=mockProvider([['route_request',{module:'goal',evidence:'made-up evidence'}],reply])
  await runAgentTurn(session(emptyBrief()),text,invalid)
  const rejected=JSON.parse(invalid.requests.at(-1).input.find(item=>item.type==='function_call_output').output)
  assert.match(rejected.error,/route_evidence_invalid/)
  const deps=mockProvider([
    ['route_request',{module:'goal',evidence:text}],
    ['route_request',{module:'goal',evidence:text}],
    reply,
  ])
  const result=await runAgentTurn(session(emptyBrief()),text,deps)
  const outputs=deps.requests.at(-1).input.filter(item=>item.type==='function_call_output').map(item=>JSON.parse(item.output))
  assert.equal(outputs[0].ok,true)
  assert.match(outputs[1].error,/route_limit/)
  assert.equal(result.state.agent_v2_context.brief.period,null)
})
