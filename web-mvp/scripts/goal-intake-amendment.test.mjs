// Independent adversarial variants of the frozen ten-persona diagnosis.
// Executes Site product code with an explicit network guard; no model/user study.
import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyBrief, updateGoalBrief, loadGoalBrief, resolveGoalPeriod } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import { explicitlyUnknownGoalEvidence, capacityEvidenceMatches } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalIntakeEvidence.ts'
import { assessGoalFeasibility, parseGoalQuantity } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalFeasibility.ts'
import { AGENT_TOOL_DEFINITIONS, loadState, runAgentTurn } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'

const seed = () => ({ ...emptyBrief(), period:{label:'3개월',weeks:13}, areas:['reading','portfolio'],
  baselines:[{area:'reading',current:'1 book per month',status:'known'},{area:'portfolio',current:'1 project',status:'known'}],
  objectives:[{area:'reading',result:'2 books',evidence:'2 books',resultKind:'metric'},{area:'portfolio',result:'3 projects',evidence:'3 projects',resultKind:'deliverable'}],
  priority:{mode:'ranked',primaryArea:'portfolio',flexibleAreas:['reading'],evidence:'portfolio first'},
  capacity:{summary:'1 hour per week',status:'known'},feasibilityAcceptance:{evidence:'도전할게'},areaCount:2,
})
const period = evidence => ({evidence,kind:'duration',normalized:evidence})
const amend = (state,text,action='remove',area='reading') => updateGoalBrief(state,{area_changes:[{area,action,evidence:text}]},text)
const us = {locale:'en-US',countryCode:'US',timeZone:'America/New_York',currencyCode:'USD',weekStartsOn:0}
function mock(text, args, question) {
  let routed=false, captured=false
  return {now:'September 16, 2026',today:'2026-09-16',regionalContext:us,request:async body => {
    let name='record_goal_brief', values={period:null,areas:[],area_changes:[],baselines:[],objectives:[],capacity:null,...args,
      reply:{paragraphs:['I have kept the information you shared.'],bullets:[],question,choices:[]}}
    if (!body.tools.some(tool=>tool.name===name)) {
      assert.equal(routed,false,'Repeated route is not a successful test')
      routed=true; name='route_request'; values={module:'goal',evidence:text}
    } else { assert.equal(captured,false,'Unexpected retry: '+JSON.stringify(body.input)); captured=true }
    return {id:name,model:'offline-fixture',usage:{input_tokens:0,output_tokens:0},output:[{type:'function_call',name,call_id:name,arguments:JSON.stringify(values)}]}
  }}
}

for (const [text,evidence] of [
  ['Change the timeframe to 8 weeks.','8 weeks'],['8 weeks','8 weeks'],
  ['기간은 8주로 변경할게.','8주'],['8주로 할게.','8주'],['Not 4 weeks, but 8 weeks.','8 weeks'],
]) test('explicit period correction: '+text,()=> {
  const before=seed(), copy=structuredClone(before)
  const after=updateGoalBrief(before,{period:period(evidence)},text)
  assert.equal(after.period.weeks,8)
  assert.equal(after.feasibilityAcceptance,null)
  assert.deepEqual(before,copy)
  assert.deepEqual(loadGoalBrief(JSON.parse(JSON.stringify(after))),after)
})
for (const text of ['Maybe 8 weeks?', 'It used to be 8 weeks.', 'Previously 8 weeks.', 'No change for now.']) {
  test('old or tentative duration cannot replace current duration: '+text,()=> {
    assert.throws(()=>updateGoalBrief(seed(),{period:period('8 weeks')},text,['I choose 8 weeks.']),/period_not_decided|period_change_requires/)
  })
}
test('normalization cannot change a literal period or expand an equivalent compact label',()=> {
  assert.equal(resolveGoalPeriod({evidence:'8 weeks',kind:'duration',normalized:'13 weeks'}),null)
  assert.equal(resolveGoalPeriod({evidence:'I choose 8 weeks.',kind:'duration',normalized:'13 weeks'}),null)
  assert.equal(resolveGoalPeriod({evidence:'Not 4 weeks, but 8 weeks.',kind:'duration',normalized:'4 weeks'}),null)
  assert.equal(resolveGoalPeriod({evidence:'Not 4 weeks, but 8 weeks.',kind:'duration',normalized:'8 weeks'}).weeks,8)
  const state=seed()
  assert.deepEqual(updateGoalBrief(state,{period:{evidence:'3개월로 할게',kind:'duration',normalized:'3개월'}},'3개월로 할게').period,state.period)
})
for (const text of ['측정한 점수는 65점', '현재 기록은 12회야', 'I am not a complete beginner.', 'I am no longer a beginner.', 'I am not starting from scratch.', '초보가 아니야', '측정한 점수는 65점이야. 목표는 아직 몰라.', 'My score is 65. I do not know the target yet.']) {
  test('known or negated facts cannot become unmeasured: '+text,()=> {
    assert.equal(explicitlyUnknownGoalEvidence(text),false)
    assert.throws(()=>updateGoalBrief(seed(),{baselines:[{area:'reading',current:text,evidence:text,status:'unmeasured'}]},text),/baseline_not_decided/)
  })
}
for (const text of ['측정해본 적 없어', '아직 기록을 안 했어', 'I have not measured my level.', 'I am a complete beginner.']) {
  test('genuine unknown baseline remains supported: '+text,()=>assert.equal(explicitlyUnknownGoalEvidence(text),true))
}
for (const text of ['현재 기록 수준은 잘 모르겠어.', 'My current level is unknown.', 'My score is not measured.', '목표는 모르겠어.', 'I do not know the deadline.']) {
  test('expected capacity slot does not override the actual subject: '+text,()=> {
    assert.equal(capacityEvidenceMatches(text,true),false)
    assert.throws(()=>updateGoalBrief({...seed(),capacity:null},{capacity:{summary:text,evidence:text,status:'unmeasured'}},text),/capacity_requires/)
  })
}
for (const text of ['Some weeks I only get two 15-minute windows.', 'I have two 15-minute slots.', 'Most weeks I have half an hour available.']) {
  test('fragmented available time before baseline: '+text,()=> {
    const after=updateGoalBrief({...seed(),baselines:[],capacity:null},{capacity:{summary:text,evidence:text,status:'estimate'}},text)
    assert.equal(after.capacity.summary,text) // no invented fixed weekly schedule
    assert.equal(after.capacity.status,'estimate')
    assert.deepEqual(after.baselines,[])
  })
}
test('short unknown can answer a capacity question without being a baseline statement',()=> {
  const text="I don't know."
  assert.equal(updateGoalBrief({...seed(),capacity:null},{capacity:{summary:text,evidence:text,status:'unmeasured'}},text).capacity.status,'unmeasured')
})

for (const [text,expected] of [
  ['1 article per week',{value:1,unit:'편',perWeek:1}], ['매주 1편',{value:1,unit:'편',perWeek:1}],
  ['I want to publish 12 articles',{value:12,unit:'편'}], ['two books each month',{value:2,unit:'권',perWeek:2/(52/12)}],
  ['half a book per week',null], // unsupported compound syntax must stay uncertain
  ['0.5 books per week',{value:.5,unit:'권',perWeek:.5}], ['20 pages daily',{value:20,unit:'쪽',perWeek:140}],
  ['1-2 books per week',null], ['1 to 2 books per week',null], ['1 book and 2 articles',null],
  ['twenty one books',null], ['1 book per day or per week',null], ['-1 book',null], ['1,000 books',null],
]) test('quantity normalization: '+text,()=>assert.deepEqual(parseGoalQuantity(text),expected))
test('equivalent Korean and English rates both require a stretch-goal choice',()=> {
  for(const [baseline,target] of [['매주 1편','12편 완성'],['1 article per week','publish 12 articles']]) {
    const brief={...emptyBrief(),period:{label:'4 weeks',weeks:4},areas:['writing'],
      baselines:[{area:'writing',current:baseline,status:'known'}],objectives:[{area:'writing',result:target}],capacity:{summary:'1 hour per week',status:'known'}}
    const result=assessGoalFeasibility(brief)
    assert.equal(result.status,'strained')
    assert.equal(result.gaps[0].requiredPerWeek,3)
    assert.equal(result.gaps[0].currentPerWeek,1)
  }
})
test('unknown or mismatched quantities are not treated as proven feasible',()=> {
  for(const current of ['getting started','1 article and 2 books','1 project per week']) {
    const brief={...seed(),areas:['reading'],baselines:[{area:'reading',current,status:'known'}]}
    assert.equal(assessGoalFeasibility(brief).status,'needs_rate')
  }
})

test('removal cleans only named goal records and invalidates stale priority/acceptance',()=> {
  const before=seed(), copy=structuredClone(before), after=amend(before,'Remove reading.')
  assert.deepEqual(before,copy)
  assert.deepEqual(after.areas,['portfolio'])
  assert.deepEqual(after.baselines.map(item=>item.area),['portfolio'])
  assert.deepEqual(after.objectives.map(item=>item.area),['portfolio'])
  assert.equal(after.priority,null); assert.equal(after.feasibilityAcceptance,null); assert.equal(after.areaCount,1)
  assert.deepEqual(after.period,before.period); assert.deepEqual(after.capacity,before.capacity)
  assert.deepEqual(after.excludedAreas,['reading'])
  assert.deepEqual(amend(after,'Remove reading.'),after)
})
for (const text of ["Don't remove reading.",'Do not delete reading.','Keep reading.','Pause reading for now.','Remove reading later.','Should we remove reading?','Explain how to remove reading.','I might remove reading.']) {
  test('no removal without a current unambiguous instruction: '+text,()=> {
    const before=seed(), copy=structuredClone(before)
    assert.throws(()=>amend(before,text),/requires_current_explicit/)
    assert.deepEqual(before,copy)
  })
}
test('partial/empty area arrays never imply replacement; targeted Korean removal still works',()=> {
  assert.deepEqual(updateGoalBrief(seed(),{areas:['portfolio']},'portfolio').areas,seed().areas)
  assert.deepEqual(updateGoalBrief(seed(),{areas:[]},'continue').areas,seed().areas)
  const brief={...emptyBrief(),areas:['독서','포트폴리오']}
  assert.deepEqual(updateGoalBrief(brief,{areas:['포트폴리오']},'독서 목표는 빼고 포트폴리오만 남겨줘.').areas,['포트폴리오'])
  for(const text of ['독서는 빼지 마','독서는 잠시 보류','독서 삭제하지 마']) {
    assert.deepEqual(updateGoalBrief(brief,{areas:['포트폴리오']},text,['포트폴리오']).areas,brief.areas)
  }
})
test('removed goals stay excluded across storage and stale model facts; restore is explicit',()=> {
  const removed=loadGoalBrief(JSON.parse(JSON.stringify(amend(seed(),'Remove reading.'))))
  const stale=updateGoalBrief(removed,{areas:['reading'],baselines:[{area:'reading',current:'1 book per month',evidence:'1 book per month',status:'known'}],
    objectives:[{area:'reading',result:'2 books',evidence:'2 books',result_kind:'metric'}]},'continue',['reading; 1 book per month; 2 books'])
  assert.deepEqual(stale,removed)
  assert.throws(()=>updateGoalBrief(removed,{area_changes:[{area:'reading',action:'restore',evidence:'Restore reading.'}]},'continue',['Restore reading.']),/requires_current_explicit/)
  const restored=amend(removed,'Restore reading.','restore')
  assert.deepEqual(restored.areas,['portfolio','reading'])
  assert.equal(restored.baselines.some(item=>item.area==='reading'),false)
  assert.equal(restored.objectives.some(item=>item.area==='reading'),false)
  assert.deepEqual(loadGoalBrief(JSON.parse(JSON.stringify(restored))),restored)
})
test('removing one goal preserves remaining priority and an unnamed pending goal',()=> {
  const brief={...seed(),areas:['reading','portfolio','exercise'],areaCount:4,
    priority:{mode:'ranked',primaryArea:'portfolio',flexibleAreas:['reading','exercise'],evidence:'portfolio first'}}
  const removed=amend(brief,'Remove reading.')
  assert.deepEqual(removed.areas,['portfolio','exercise'])
  assert.equal(removed.areaCount,3) // one requested but not yet named goal remains
  assert.deepEqual(removed.priority,{...brief.priority,flexibleAreas:['exercise']})
  const restored=amend(removed,'Restore reading.','restore')
  assert.equal(restored.areaCount,4)
  assert.equal(restored.priority,null) // new scope needs priority confirmation
})
test('conflicting or malformed area changes fail atomically',()=> {
  const state=seed(), copy=structuredClone(state)
  for(const changes of [{},[null],[{area:'reading',action:'remove',evidence:'Remove reading.'},{area:'reading',action:'restore',evidence:'Restore reading.'}]]) {
    assert.throws(()=>updateGoalBrief(state,{area_changes:changes},'Remove reading. Restore reading.'))
    assert.deepEqual(state,copy)
  }
})
test('new area-change tool parameters satisfy strict object schema requirements',()=> {
  const definition=AGENT_TOOL_DEFINITIONS.find(item=>item.name==='record_goal_brief')
  assert.equal(definition.strict,true)
  assert.ok(definition.parameters.required.includes('area_changes'))
  function visit(schema) {
    if(!schema||typeof schema!=='object') return
    if(schema.type==='object') {
      assert.equal(schema.additionalProperties,false)
      assert.deepEqual([...schema.required].sort(),Object.keys(schema.properties).sort())
    }
    for(const value of Object.values(schema)) if(Array.isArray(value)) value.forEach(visit); else visit(value)
  }
  visit(definition.parameters)
})
test('full agent accepts English correction and reload preserves it without reasking duration',async()=> {
  const brief={...seed(),areas:['reading'],baselines:[],objectives:seed().objectives.filter(item=>item.area==='reading'),priority:null,areaCount:1}
  const text='Change the timeframe to 8 weeks.'
  const result=await runAgentTurn(loadState({stage:5,agent_v2_context:{brief}}),text,mock(text,{period:period('8 weeks')},'What is your current reading level?'))
  assert.equal(loadState(JSON.parse(JSON.stringify(result.state))).agent_v2_context.brief.period.weeks,8)
  assert.doesNotMatch(result.assistant_message,/How long|timeframe/)
})
test('full agent applies area removal contract and keeps other facts',async()=> {
  const brief={...seed(),capacity:null},text='Remove reading.'
  const result=await runAgentTurn(loadState({stage:5,agent_v2_context:{brief}}),text,mock(text,{area_changes:[{area:'reading',action:'remove',evidence:text}]},'How much time can you spend each week?'))
  assert.deepEqual(result.state.agent_v2_context.brief.areas,['portfolio'])
  assert.deepEqual(result.state.agent_v2_context.brief.excludedAreas,['reading'])
  assert.deepEqual(result.state.agent_v2_context.brief.period,brief.period)
})
test('automatic Korean duration capture does not throw on an unrelated old period',async()=> {
  const brief={...seed(),areas:['reading'],baselines:[],objectives:seed().objectives.filter(item=>item.area==='reading'),priority:null,areaCount:1},text='예전에는 8주였어.'
  const result=await runAgentTurn(loadState({stage:5,agent_v2_context:{brief}}),text,mock(text,{},'What is your current reading level?'))
  assert.deepEqual(result.state.agent_v2_context.brief.period,brief.period)
})
