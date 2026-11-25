import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
import {assessPaidCoachingGate,assertPaidCoachingAllowed,paidReviewCriteria} from './coaching-paid-gate.mjs'

const root=fileURLToPath(new URL('../../',import.meta.url))

// Only verifies gate mechanics. These fabricated approvals must never be
// persisted as real quality evidence, confidence, or permission to spend.
const now=Date.parse('2026-09-17T08:00:00Z')
const context={sourceSha256:'unit-source',maximumCostUsd:0.1,remainingApprovedUsd:0.484389,now}
const fixture=()=>({decision:'eligible_after_evidence_review',confidencePercent:70,confidenceMeaning:'reviewer_judgment_not_statistical_probability',reviewer:'unit fixture',reviewedAt:new Date(now).toISOString(),sourceSha256:'unit-source',rationale:'NOT a real review; unit fixture only',blockers:[],evidence:[{kind:'unaltered_provider_responses',path:'unit-only.json',sha256:'a'.repeat(64)}],criteria:paidReviewCriteria.map(id=>({id,status:'supported',reason:'unit fixture only',evidenceIndexes:[0]}))})
test('70 is an explicit reviewed judgment, never a unit pass rate or quality guarantee',()=>{
  const r=assessPaidCoachingGate(fixture(),context)
  assert.equal(r.allowed,true)
  assert.equal(r.statisticalConfidenceEstablished,false)
  assert.equal(r.liveQualityValidated,false)
})
for(const confidencePercent of [null,undefined,0,69.999,'100',NaN,Infinity,101])test(`rejects unsupported confidence ${confidencePercent}`,()=>{
  assert.equal(assessPaidCoachingGate({...fixture(),confidencePercent},context).allowed,false)
})
test('thousands of passing unit tests and authored controls cannot replace actual response evidence',()=>{
  const r=fixture();r.evidence[0].kind='offline_authored_controls';r.passedTests=2337;r.controlPassRate=1
  assert.ok(assessPaidCoachingGate(r,context).issues.includes('real_response_evidence_missing'))
})
test('a critical blocker, missing revision review or invalid reference blocks even 100 confidence',()=>{
  for(const mutate of [r=>r.blockers.push('draft_not_delivered'),r=>{r.criteria.find(c=>c.id==='revision').status='not_run'},r=>{r.criteria[0].evidenceIndexes=[99]}]){
    const r=fixture();r.confidencePercent=100;mutate(r)
    assert.equal(assessPaidCoachingGate(r,context).allowed,false)
  }
})
test('old source, stale review, oversized request and unresolved budget do not authorize payment',()=>{
  assert.equal(assessPaidCoachingGate({...fixture(),sourceSha256:'old'},context).allowed,false)
  assert.equal(assessPaidCoachingGate({...fixture(),reviewedAt:'2026-09-15T00:00:00Z'},context).allowed,false)
  for(const maximumCostUsd of [0,-1,NaN,Infinity,0.5])assert.equal(assessPaidCoachingGate(fixture(),{...context,maximumCostUsd}).allowed,false)
  assert.equal(assessPaidCoachingGate(fixture(),{...context,remainingApprovedUsd:null}).allowed,false)
})
test('current real decision is HOLD, no claimed confidence or paid permission',()=>{
  const review=JSON.parse(readFileSync(resolve(root,'docs/agent/coaching-paid-review.json'),'utf8'))
  assert.equal(review.decision,'hold')
  assert.equal(review.confidencePercent,null)
  assert.throws(()=>assertPaidCoachingAllowed(0.1),/paid_coaching_quality_hold/)
})
test('all reference paid entry points check the review before reading credentials or writing runs',()=>{
  for(const name of ['replay','depth-followup','continue-owned']){
    const source=readFileSync(resolve(root,`logs/reference-replay/${name}.mjs`),'utf8')
    const gate=source.indexOf('assertPaidCoachingAllowed(',source.indexOf("from '../../web-mvp/scripts/coaching-paid-gate.mjs'"))
    assert.ok(gate>=0)
    for(const token of ['process.loadEnvFile(',"'/session-access.local'",'fs.writeFileSync(','await fetch(']) {
      const offset=source.indexOf(token)
      if(offset>=0)assert.ok(gate<offset,`${name}: ${token}`)
    }
  }
})
test('archived follow-up commands fail before side effects, under network guard',()=>{
  const paths=['logs/reference-replay/2026-09-17-depth-live/report.json','logs/reference-replay/2026-09-17-approved-intake-repair/report.json','logs/reference-replay/2026-09-17-approved-budget-summary.json']
  const hashes=()=>paths.map(p=>createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex'))
  const before=hashes()
  const env={...process.env,ONJU_OFFLINE:'1',ONJU_ALLOW_PAID_EVALS:'0'}
  for(const key of Object.keys(env))if(/^(?:VITE_)?(?:OPENAI_|GEMINI_|ANTHROPIC_|SUPABASE_)/.test(key))delete env[key]
  for(const name of ['depth-followup','continue-owned']){
    const result=spawnSync(process.execPath,['--import',new URL('./offline-network-guard.mjs',import.meta.url).href,`logs/reference-replay/${name}.mjs`],{cwd:root,env,encoding:'utf8',timeout:10000})
    assert.notEqual(result.status,0)
    assert.match(result.stderr,/paid_coaching_quality_hold/)
  }
  assert.deepEqual(hashes(),before)
})
