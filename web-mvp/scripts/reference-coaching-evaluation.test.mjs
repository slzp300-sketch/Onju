import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { coachingCriteria, evidenceHash, coachingTranscriptHash, coachingSourceHash, assessCoachingEvidence } from '../../logs/sites/onju-web-mvp/web-mvp/scripts/reference-coaching-evaluation.mjs'
import { loadEvaluationPolicy, validateEvaluationPolicy, evaluateAgentResult } from '../../logs/sites/onju-web-mvp/web-mvp/scripts/evaluation-policy.mjs'
import { cleanRegionalContext } from '../../logs/sites/onju-web-mvp/supabase/functions/_shared/onjuRegionalContext.ts'
import { createEvaluationBudget } from '../../logs/sites/onju-web-mvp/web-mvp/scripts/evaluation-budget.mjs'
import { conservativeCandidateRequestCostUsd } from '../../logs/sites/onju-web-mvp/web-mvp/scripts/candidate-evaluation.mjs'

const cases=JSON.parse(readFileSync(new URL('../../logs/sites/onju-web-mvp/web-mvp/evals/onju-reference-coaching.json',import.meta.url),'utf8'))
// Only a fixture for testing the evidence gate; never saved as a real report.
const report=()=>({runId:'unit-test-only',executionMode:'local_direct_agent',provider:'openai',suiteId:'reference-coaching',status:'automatic_checks_passed',
  sourceSha256:'test-source',fixtureSha256:evidenceHash(cases),sourceUnchanged:true,performance:{calls:26},providerCalls:[{responseId:'test-response',model:'test-model',usage:{inputTokens:10}}],
  cases:cases.map((scenario,i)=>({caseId:`reference-coaching-${i+1}`,passed:true,failedChecks:[],transcript:scenario.turns.map((user,t)=>({turn:t+1,user,assistant:'검수용 가짜 응답. 실제 모델이 생성한 응답이 아닙니다.',passed:true,failedChecks:[]}))}))})
const review=(r)=>({runId:r.runId,transcriptSha256:coachingTranscriptHash(r),reviewerType:'human',reviewer:'Unit-test reviewer (not a real evaluation)',userAccepted:true,
  cases:r.cases.map(c=>({caseId:c.caseId,turns:c.transcript.map(t=>({turn:t.turn,criticalFailures:[],scores:Object.fromEntries(coachingCriteria.map(k=>[k,2])),evidence:Object.fromEntries(coachingCriteria.map(k=>[k,t.assistant]))}))}))})
const assess=(r,v)=>assessCoachingEvidence(r,cases,v,'test-source')

test('rendering, styles and follow-up state changes invalidate the old evidence hash',()=>{
  const root=mkdtempSync(resolve(tmpdir(),'onju-evidence-source-'))
  try {
    for(const dir of ['supabase/functions','web-mvp/scripts','web-mvp/evals','web-mvp/src'])mkdirSync(resolve(root,dir),{recursive:true})
    const base=coachingSourceHash(root)
    for(const name of ['AgentText.tsx','styles.css','agentSession.ts']) {
      const file=resolve(root,'web-mvp/src',name)
      writeFileSync(file,'version one')
      const first=coachingSourceHash(root)
      assert.notEqual(first,base,`${name} must be included`)
      writeFileSync(file,'version two')
      assert.notEqual(coachingSourceHash(root),first,`${name} must invalidate prior review`)
    }
    const before=coachingSourceHash(root)
    writeFileSync(resolve(root,'web-mvp/src/.env.local'),'NOT_A_REAL_SECRET')
    assert.equal(coachingSourceHash(root),before,'do not read environment files')
  } finally {rmSync(root,{recursive:true,force:true})}
})

test('reference suite covers ten conversations with explicit review goals and no source transcript',()=>{
  assert.equal(cases.length,10)
  assert.equal(cases.reduce((n,c)=>n+c.turns.length,0),24)
  assert.ok(cases.every(c=>c.reviewFocus.length>=3))
  assert.ok(cases.some(c=>c.regionalContext?.locale==='en-US'))
  for(const c of cases.filter(c=>c.regionalContext)) assert.deepEqual(cleanRegionalContext(c.regionalContext),c.regionalContext)
  assert.equal(validateEvaluationPolicy().ok,true)
  assert.equal(loadEvaluationPolicy().suites.find(s=>s.id==='reference-coaching').syntheticOnly,true)
})

test('no live report and auto-pass alone cannot prove coaching quality',()=>{
  assert.equal(assess(null,null).status,'not_run')
  assert.deepEqual(assess(report(),null),{status:'awaiting_review',validated:false,issues:['content_review_missing']})
})
for(const [name,mutate] of [
  ['scripted provider',r=>{r.provider='offline'}],
  ['missing usage',r=>{r.providerCalls=[]}],
  ['changed source',r=>{r.sourceUnchanged=false}],
  ['stale source',r=>{r.sourceSha256='old-source'}],
  ['changed fixtures',r=>{r.fixtureSha256='old-fixtures'}],
  ['partial cases',r=>{r.cases.pop()}],
  ['duplicate cases',r=>{r.cases[9]=r.cases[0]}],
  ['unfinished turns',r=>{r.cases[0].transcript.pop()}],
  ['empty answer',r=>{r.cases[0].transcript[0].assistant=''}],
  ['failed turn hidden in case pass',r=>{r.cases[0].transcript[0].passed=false}],
]) test(`quality gate rejects ${name}`,()=>{
  const r=report();mutate(r)
  assert.equal(assess(r,review(r)).validated,false)
})
test('agent review requires separate user acceptance; human review must cite the exact responses',()=>{
  const r=report(),v=review(r)
  assert.equal(assess(r,v).status,'validated_scope')
  v.reviewerType='agent'
  assert.equal(assess(r,v).status,'awaiting_user_acceptance')
  v.reviewerType='human';v.userAccepted=false
  assert.equal(assess(r,v).validated,false)
  v.userAccepted=true;v.cases[0].turns[0].evidence.intent='not in response'
  assert.equal(assess(r,v).status,'failed')
})
test('changed responses invalidate an old review, and critical failures cannot be averaged away',()=>{
  const r=report(),v=review(r)
  r.cases[0].transcript[0].assistant+=' 추가'
  assert.ok(assess(r,v).issues.includes('review_evidence_mismatch'))
  const fresh=review(r)
  fresh.cases[0].turns[0].criticalFailures=['unapproved_plan_activation']
  assert.equal(assess(r,fresh).validated,false)
  fresh.cases[0].turns[0].criticalFailures=[]
  fresh.cases[0].turns[0].scores.intent=1
  assert.equal(assess(r,fresh).validated,false)
})
test('per-case strict preferences remain strict despite the general three-question allowance',()=>{
  const result={assistant_message:'Tools?\n\nTime?',suggestions:[],needs_clarification:true,state:{}}
  assert.ok(evaluateAgentResult(result,{maxQuestions:1}).failedChecks.includes('maximum_questions'))
  assert.ok(!evaluateAgentResult(result,{maxQuestions:3}).failedChecks.includes('maximum_questions'))
})

test('unknown charged attempts remain reserved before retries instead of being treated as free',()=>{
  const budget=createEvaluationBudget(1)
  budget.reserve(0.4) // Lost response: usage is unknown, not zero.
  const retry=budget.reserve(0.4)
  assert.throws(()=>budget.reserve(0.4),/cost_limit_preflight/)
  budget.settle(retry,0.1)
  assert.deepEqual(budget.snapshot(),{measuredUsd:0.1,uncertainUpperBoundUsd:0.4,uncertainAttempts:1})
  assert.doesNotThrow(()=>budget.reserve(0.4))
})
test('successful attempts release the unused reservation but cannot settle twice',()=>{
  const budget=createEvaluationBudget(1)
  const id=budget.reserve(0.8)
  budget.settle(id,0.2)
  assert.throws(()=>budget.settle(id,0),/unknown_evaluation_reservation/)
  assert.doesNotThrow(()=>budget.reserve(0.7))
  assert.throws(()=>budget.reserve(0.2),/cost_limit_preflight/)
})
test('invalid or underestimated cost does not allow unnoticed budget continuation',()=>{
  assert.throws(()=>createEvaluationBudget(Infinity),/invalid_evaluation_budget/)
  const budget=createEvaluationBudget(1),id=budget.reserve(0.2)
  assert.throws(()=>budget.settle(id,NaN),/invalid_measured_cost/)
  assert.equal(budget.snapshot().uncertainUpperBoundUsd,0.2)
  assert.throws(()=>budget.settle(id,1.1),/cost_estimate_exceeded/)
  assert.throws(()=>budget.reserve(0.1),/cost_limit_preflight/)
  const request={model:'priced-test',input:'test',max_output_tokens:0}
  const upper=conservativeCandidateRequestCostUsd(request,{provider:'openai',rates:{'priced-test':{input:1,cached:0.1,cacheWrite:10,output:1}}})
  assert.ok(upper>=new TextEncoder().encode(JSON.stringify(request)).length*10/1e6)
})
