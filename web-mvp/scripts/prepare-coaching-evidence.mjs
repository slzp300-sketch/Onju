// Offline only: no credential loading, provider calls, deployment or budget edits.
import './offline-network-guard.mjs'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {parseArgs} from 'node:util'
import {createHash} from 'node:crypto'
import {coachingSourceHash} from '../../logs/sites/onju-web-mvp/web-mvp/scripts/reference-coaching-evaluation.mjs'
import {assessCoachingPreparation,summarizeHistoricalCost} from './coaching-evidence-readiness.mjs'

const root=resolve(import.meta.dirname,'../..')
const {values}=parseArgs({options:{'offline-summary':{type:'string'},'saved-summary':{type:'string'}}})
if(!values['offline-summary']||!values['saved-summary'])throw Error('both_offline_and_saved_summary_required')
const load=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'))
const fileEvidence=p=>({path:p.replaceAll('\\','/'),sha256:createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')})
const contractPath='docs/agent/coaching-document-quality.json'
const budgetPath='logs/reference-replay/2026-09-17-approved-budget-summary.json'
const auditPath='logs/reference-replay/2026-09-17-depth-live/provider-audit.private.json'
const contract=load(contractPath),offline=load(values['offline-summary']),saved=load(values['saved-summary']),budget=load(budgetPath)
const sourceSha256=coachingSourceHash(resolve(root,'logs/sites/onju-web-mvp'))
const readiness=assessCoachingPreparation({contract,offline,saved,sourceSha256})
const historical=summarizeHistoricalCost(load(auditPath).calls)
const reservations=(saved.dryRequestReservations??[]).flatMap(t=>t.requests)
const largestDryRequestReservationUsd=reservations.length?Math.max(...reservations.map(r=>r.reservationUsd)):null
const round=n=>Math.round(n*1e6)/1e6
// A planning range, not a guarantee: reuse the historical 4-turn cost, then
// budget two further turns at the average-to-largest observed call cost.
// Future turns may require more than one call. Explicit approval/reload is local.
const onePassEstimate=historical.measuredCalls?{
  lowerUsd:round(historical.measuredUsd+2*historical.measuredUsd/historical.measuredCalls),
  upperUsd:round(historical.measuredUsd+2*historical.maxObservedCallUsd),
  assumption:'historical first four turns plus one call each for revision and execution report; repairs, clarification and unknown calls excluded',
  kind:'rough_scenario_estimate_not_spending_cap',
}:null
const report={createdAt:new Date().toISOString(),kind:'offline_evidence_preparation',...readiness,sourceSha256,
  contractVersion:contract.version,evidence:[contractPath,values['offline-summary'],values['saved-summary'],budgetPath,auditPath].map(fileEvidence),
  cost:{historical,onePassEstimate,largestDryRequestReservationUsd,remainingPreviouslyApprovedUsd:budget.remainingApprovedUsd,
    largestDryRequestFitsRemaining:largestDryRequestReservationUsd!==null&&largestDryRequestReservationUsd<=budget.remainingApprovedUsd,
    rates:'Existing project configuration; not freshly verified provider billing rates',newlyApprovedUsd:0,newCalls:0,newCostUsd:0},
  nextStage:'Separate approval of a bounded evidence-collection run and any change to the old 70% admission gate is required. Public deployment remains unchanged.',
}
const reviewTemplate={kind:'UNFILLED_REVIEW_TEMPLATE_NOT_EVIDENCE',sourceSha256,contractSha256:fileEvidence(contractPath).sha256,
  providerRunId:null,reviewer:null,userAccepted:false,criticalFailures:null,
  stages:contract.coreJourney.map(s=>({id:s.id,inputKind:s.inputKind,actualInput:null,actualAnswer:null,providerResponseIds:[],rawResponseArtifactSha256:null,storedStateArtifactSha256:null,renderEvidenceArtifactSha256:null,
    checks:s.checks.map(id=>({id,score:null,reason:null,evidenceQuote:null})),status:'not_run'})),
}
const folder=resolve(root,'logs/reference-replay','prepared-'+report.createdAt.replace(/[:.]/g,'-'))
mkdirSync(folder,{recursive:true})
writeFileSync(resolve(folder,'summary.json'),JSON.stringify(report,null,2))
writeFileSync(resolve(folder,'review-template.json'),JSON.stringify(reviewTemplate,null,2))
console.log(JSON.stringify({report:resolve(folder,'summary.json'),reviewTemplate:resolve(folder,'review-template.json'),...readiness,cost:report.cost},null,2))
if(readiness.blockers.length)process.exitCode=2
