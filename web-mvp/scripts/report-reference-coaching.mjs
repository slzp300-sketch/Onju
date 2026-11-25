// Read-only evaluation assessment. This entry point cannot call a provider.
import './offline-network-guard.mjs'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { coachingSourceHash, evidenceHash, assessCoachingEvidence } from '../../logs/sites/onju-web-mvp/web-mvp/scripts/reference-coaching-evaluation.mjs'

const {values}=parseArgs({options:{report:{type:'string'},review:{type:'string'}}})
const siteRoot=resolve(import.meta.dirname,'../../logs/sites/onju-web-mvp')
const cases=JSON.parse(readFileSync(resolve(siteRoot,'web-mvp/evals/onju-reference-coaching.json'),'utf8'))
const load=file=>file?JSON.parse(readFileSync(resolve(file),'utf8')):null
const sourceSha256=coachingSourceHash(siteRoot)
const assessment=assessCoachingEvidence(load(values.report),cases,load(values.review),sourceSha256)
console.log(JSON.stringify({
  ...assessment, sourceSha256,fixtureSha256:evidenceHash(cases),
  caseCount:cases.length,userTurns:cases.reduce((sum,c)=>sum+c.turns.length,0),
  paidCallsByThisCommand:0,
  cases:cases.map((c,i)=>({caseId:`reference-coaching-${i+1}`,name:c.name,turns:c.turns.length,reviewFocus:c.reviewFocus})),
  note:'이 명령은 증거만 검사합니다. 실제 생성·내용 검수·사용자 승인이 모두 없으면 완료로 표시하지 않습니다. 통과해도 명시한 사례와 소스 버전에만 유효합니다.',
},null,2))
if(values.report&&!assessment.validated)process.exitCode=2
