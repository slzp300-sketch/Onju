import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {assessCoachingPreparation,summarizeHistoricalCost} from './coaching-evidence-readiness.mjs'
const contract=JSON.parse(readFileSync(new URL('../../docs/agent/coaching-document-quality.json',import.meta.url),'utf8'))
const input=()=>({sourceSha256:'unit-only',contract,offline:{coachingSourceSha256:'unit-only',passed:true,sourceUnchangedDuringChecks:true,checks:[{code:0}],paidProviderCalls:0},saved:{coachingSourceSha256:'unit-only',structuralChecksPassed:true,sourceEvidenceUnchanged:true,networkGuardVerified:true,originalInputsMatch:true,controls:[{expectationMet:true}],savedPreFourthContext:{unknownResponseNotFabricated:true},additionalProviderCalls:0}})
test('preparation success is neither paid permission nor real response quality',()=>{
  const r=assessCoachingPreparation(input())
  assert.equal(r.canRequestBoundedEvaluation,true)
  assert.equal(r.paidCallsAllowed,false)
  assert.equal(r.liveQualityValidated,false)
  assert.equal(r.confidencePercent,null)
})
test('missing, stale or partially failing preparation cannot pass',()=>{
  for(const change of [x=>{x.offline=null},x=>{x.saved=null},x=>{x.sourceSha256='new'},x=>{x.offline.checks=[]},x=>{x.offline.checks[0].code=1},x=>{x.saved.controls[0].expectationMet=false},x=>{x.saved.savedPreFourthContext.unknownResponseNotFabricated=false},x=>{x.saved.additionalProviderCalls=1}]){
    const x=input();change(x);assert.equal(assessCoachingPreparation(x).canRequestBoundedEvaluation,false)
  }
})
test('contract preserves insufficient-information rule and separate acceptance/approval gates',()=>{
  assert.equal(new Set(contract.criteria.map(c=>c.id)).size,6)
  assert.equal(new Set(contract.coreJourney.map(c=>c.id)).size,7)
  assert.ok(contract.coreJourney.every(s=>s.checks.every(id=>contract.criteria.some(c=>c.id===id))))
  assert.equal(contract.completion.humanFinalAcceptanceRequired,true)
  assert.equal(contract.completion.criticalFailureCount,0)
  assert.equal(contract.spending.existing70PercentGateChanged,false)
  assert.match(contract.criteria.find(c=>c.id==='questions').pass,/정보 부족 시 실행 초안 대신 방향/)
})
test('observed cost and unknown reservations cannot be conflated',()=>{
  const r=summarizeHistoricalCost([{state:'completed',actual_microusd:100000,charged_microusd:100000},{state:'unknown',actual_microusd:null,charged_microusd:400000}])
  assert.equal(r.measuredUsd,.1);assert.equal(r.unknownReservationUsd,.4)
  assert.equal(r.unknownCalls,1);assert.equal(r.providerInvoiceVerified,false)
  assert.equal(summarizeHistoricalCost([{state:'unknown'}]).unknownReservationUsd,null)
  assert.equal(summarizeHistoricalCost([]).maxObservedCallUsd,null)
})
