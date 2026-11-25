import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {resolve,relative,isAbsolute} from 'node:path'
import {fileURLToPath} from 'node:url'
import {coachingSourceHash} from '../../logs/sites/onju-web-mvp/web-mvp/scripts/reference-coaching-evaluation.mjs'

const root=fileURLToPath(new URL('../../',import.meta.url))
export const paidReviewCriteria=['intent','grounding','questionFit','depth','actionability','continuity','delivery','revision']

// This verifies an explicit evidence-review decision. It does NOT estimate a
// probability or convert unit-test/fixture pass rates into model quality.
export function assessPaidCoachingGate(review,{sourceSha256,maximumCostUsd,remainingApprovedUsd,now=Date.now()}={}) {
  const issues=[]
  if(review?.decision!=='eligible_after_evidence_review')issues.push('quality_review_on_hold')
  if(typeof review?.confidencePercent!=='number'||!Number.isFinite(review.confidencePercent)||review.confidencePercent<70||review.confidencePercent>100)issues.push('confidence_70_not_established')
  if(review?.confidenceMeaning!=='reviewer_judgment_not_statistical_probability')issues.push('confidence_basis_missing')
  if(!sourceSha256||review?.sourceSha256!==sourceSha256)issues.push('review_source_mismatch')
  if(!review?.reviewer?.trim()||!review?.rationale?.trim())issues.push('reasoned_review_missing')
  if(!Array.isArray(review?.blockers)||review.blockers.length)issues.push('unresolved_quality_blockers')
  if(!Array.isArray(review?.evidence)||!review.evidence.some(e=>e.kind==='unaltered_provider_responses'&&e.path&&/^[a-f0-9]{64}$/.test(e.sha256)))issues.push('real_response_evidence_missing')
  for(const id of paidReviewCriteria) {
    const item=review?.criteria?.find(c=>c.id===id)
    if(item?.status!=='supported'||!item.reason?.trim()||!Array.isArray(item.evidenceIndexes)||!item.evidenceIndexes.length||item.evidenceIndexes.some(i=>!Number.isInteger(i)||!review?.evidence?.[i]))issues.push(`criterion_not_supported:${id}`)
  }
  const reviewedAt=Date.parse(review?.reviewedAt??'')
  if(!Number.isFinite(reviewedAt)||reviewedAt>now||now-reviewedAt>24*60*60*1000)issues.push('review_stale')
  if(!(Number.isFinite(maximumCostUsd)&&maximumCostUsd>0&&Number.isFinite(remainingApprovedUsd)&&maximumCostUsd<=remainingApprovedUsd))issues.push('budget_preflight_failed')
  return {allowed:issues.length===0,issues,statisticalConfidenceEstablished:false,liveQualityValidated:false}
}

export function assertPaidCoachingAllowed(maximumCostUsd) {
  // No environment keys, session tokens, run folders, or network are touched
  // before this check. Missing/malformed evidence always fails closed.
  const review=JSON.parse(readFileSync(resolve(root,'docs/agent/coaching-paid-review.json'),'utf8'))
  const budget=JSON.parse(readFileSync(resolve(root,'logs/reference-replay/2026-09-17-approved-budget-summary.json'),'utf8'))
  const result=assessPaidCoachingGate(review,{sourceSha256:coachingSourceHash(resolve(root,'logs/sites/onju-web-mvp')),maximumCostUsd,remainingApprovedUsd:budget.remainingApprovedUsd})
  if(!result.allowed)throw Error('paid_coaching_quality_hold: '+result.issues.join(', '))
  for(const evidence of review.evidence) {
    const file=resolve(root,evidence.path),rel=relative(root,file)
    if(rel.startsWith('..')||isAbsolute(rel)||!/^logs[\\/]reference-replay[\\/]/.test(rel)||!file.endsWith('.json')||/session-access|authorization|budget/i.test(file))throw Error('paid_review_evidence_path_invalid')
    if(createHash('sha256').update(readFileSync(file)).digest('hex')!==evidence.sha256)throw Error('paid_review_evidence_changed')
  }
  return result
}
