// Pure preparation check. It cannot authorize provider calls or grade generated text.
export function assessCoachingPreparation({offline, saved, sourceSha256, contract}) {
  const blockers=[]
  if(!sourceSha256 || offline?.coachingSourceSha256!==sourceSha256 || saved?.coachingSourceSha256!==sourceSha256)blockers.push('stale_or_unbound_source')
  if(offline?.passed!==true || offline?.sourceUnchangedDuringChecks!==true
    || !offline?.checks?.length || offline.checks.some(c=>c.code!==0))blockers.push('offline_checks_incomplete')
  if(saved?.structuralChecksPassed!==true || saved?.sourceEvidenceUnchanged!==true
    || saved?.networkGuardVerified!==true || saved?.originalInputsMatch!==true
    || !saved?.controls?.length || saved.controls.some(c=>c.expectationMet!==true)
    || saved?.savedPreFourthContext?.unknownResponseNotFabricated!==true)blockers.push('saved_replay_incomplete')
  if(offline?.paidProviderCalls!==0 || saved?.additionalProviderCalls!==0)blockers.push('not_offline_preparation')
  if(contract?.version!=='document-quality-v1' || contract?.criteria?.length!==6
    || contract?.referenceAssistantAllowedInModelInput!==false
    || contract?.spending?.boundedEvidenceCollectionRequiresSeparateApproval!==true)blockers.push('acceptance_contract_missing')
  return {
    status:blockers.length?'preparation_incomplete':'offline_prepared_awaiting_paid_approval',
    blockers,canRequestBoundedEvaluation:blockers.length===0,
    paidCallsAllowed:false,liveQualityValidated:false,confidencePercent:null,
  }
}

// Values are observed estimates from local billing metadata, NOT invoices or
// fresh provider prices. Unknown calls remain outside measured totals.
export function summarizeHistoricalCost(calls) {
  const measured=calls.filter(c=>c.state==='completed'&&Number.isSafeInteger(c.actual_microusd)&&c.actual_microusd>=0)
  const uncertain=calls.filter(c=>!measured.includes(c))
  const measuredUsd=measured.reduce((n,c)=>n+c.actual_microusd,0)/1e6
  const maxObservedCallUsd=measured.length?Math.max(...measured.map(c=>c.actual_microusd))/1e6:null
  const unknownReservationUsd=uncertain.every(c=>Number.isSafeInteger(c.charged_microusd)&&c.charged_microusd>=0)
    ?uncertain.reduce((n,c)=>n+c.charged_microusd,0)/1e6:null
  return {measuredCalls:measured.length,measuredUsd,maxObservedCallUsd,unknownCalls:uncertain.length,unknownReservationUsd,providerInvoiceVerified:false}
}
