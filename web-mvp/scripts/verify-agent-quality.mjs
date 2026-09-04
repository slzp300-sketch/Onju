// Post-change live regressions against the preserved A/B fixtures; no production DB writes.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { emptyGoal, initialGoalProseIssue, requestedSingleSession } from '../../supabase/functions/onju-agent-v2/goal.ts'
import { fitsDailyCapacity } from '../../supabase/functions/onju-agent-v2/goalEffort.ts'
import { executionIssue, synchronizeExecution } from '../../supabase/functions/onju-agent-v2/goalExecution.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const folder = resolve(root, 'logs/agent-quality')
const functionDir = resolve(root, 'supabase/functions/onju-agent-quality-eval')
const json = file => JSON.parse(readFileSync(file, 'utf8'))
const write = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2))
const hash = value => createHash('sha256').update(value).digest('hex')
const sourceFiles = ['agent.ts','goal.ts','policy.ts','prompt.ts','state.ts','goalRevision.ts','goalEffort.ts','goalExecution.ts']
const sourceHashes = () => Object.fromEntries(sourceFiles.map(file => [file,hash(readFileSync(resolve(root,'supabase/functions/onju-agent-v2',file),'utf8').replaceAll('\r\n','\n'))]))
const baseline = json(resolve(root,'docs/evals/agent-model-comparison-2026-09-04.json'))
const fixtures = structuredClone(baseline.fixtures)
const executionSuite=process.argv.includes('--suite=goal-execution')
const goalSuite=executionSuite||process.argv.includes('--suite=goal-design')
const action=(title,frequencyPerWeek,durationMinutes)=>({title,frequencyPerWeek,durationMinutes,preferredDays:[]})
const reading={...emptyGoal,category:'독서',outcome:'독서 습관',durationWeeks:2,targetMetric:'2주간 6회',weeklyActions:[action('독서',3,10)],fallbackAction:'책을 펼쳐 한 문장 읽기'}
const rhythm=[{days:[0,1,2,3,4],wake:'06:00',bedtime:'23:00',variable:false},{days:[5,6],wake:'',bedtime:'',variable:true,deferred:true}]
const three={...reading,category:'복수 분야',outcome:'일·건강·신앙의 습관',targetMetric:'2주간 최소 7회',weeklyActions:[action('업무 회고',2,5),action('산책',2,20),action('기도',3,3)]}
if(goalSuite)fixtures.push(
 {id:'goal-only-frequency',initial:{stage:5,day_bounds:rhythm,goal_card:three},message:'업무 회고만 주 1회로 줄여줘. 나머지 조건은 그대로 두고 아직 확정하지 마.'},
 {id:'goal-related-count',initial:{stage:5,day_bounds:rhythm,goal_card:reading},message:'독서 횟수만 주 1회로 줄여줘. 기간과 다른 조건은 그대로.'},
 {id:'goal-duration-only',initial:{stage:5,day_bounds:rhythm,goal_card:reading},message:'독서 시간만 5분으로 바꿔줘. 횟수와 기간, 결과 기준은 그대로.'},
 {id:'goal-small-budget',initial:{stage:5,day_bounds:rhythm},message:'하루 10분밖에 없어. 일, 건강, 신앙 목표를 작게 시작할 초안을 추천해줘.'},
 {id:'goal-light-first',initial:{stage:5,day_bounds:rhythm},message:'퇴근하고 지쳐서 길게는 못 하겠어. 일, 건강, 신앙을 가볍게 시작하는 초안을 추천해줘.'},
 {id:'goal-explicit-long',initial:{stage:5,day_bounds:rhythm},message:'운동을 주 3회 60분씩 하고 싶어. 이 횟수와 시간은 유지해서 2주 시험 계획을 제안해줘.'},
)
// v3 stores a displayed draft as a versioned object. Same approved terms as the
const executionReading=synchronizeExecution({...reading,targetMetric:'실행률 80%',execution:{measurement:'routine_completion',completionPercent:80,reviewEveryWeeks:1,actions:[{completionCriterion:'읽은 문장 한 개 표시하기',minimumAction:'책 한 문장 읽기',minimumMinutes:1}]}})
if(executionSuite)fixtures.push(
 {id:'execution-percent',initial:{stage:5,day_bounds:rhythm},message:'독서 주 3회, 10분씩 2주 동안 하고 실행률 80%를 목표로 할게. 완료 기준과 바쁜 날 최소 행동까지 초안으로 제안해줘.'},
 {id:'execution-korean-number',initial:{stage:5,day_bounds:rhythm,goal_card:executionReading},message:'독서 횟수만 일주일에 한 번으로 줄여줘. 나머지는 그대로.'},
 {id:'execution-correction',initial:{stage:5,day_bounds:rhythm,goal_card:executionReading},message:'독서 시간만 5분 말고 7분으로 바꿔줘.'},
 {id:'execution-minimum',initial:{stage:5,day_bounds:rhythm,goal_card:executionReading},message:'독서의 바쁜 날 최소 행동만 책 제목 읽기로 바꿔줘. 횟수, 시간과 기간은 그대로.'},
 {id:'execution-custom-outcome',initial:{stage:5,day_bounds:rhythm},message:'4주 동안 소설 초고를 현재 1000자에서 2000자로 늘리고 싶어. 매주 초고를 주 2회 10분씩 쓰는 루틴과 완료 기준을 제안해줘. 성과 목표를 루틴 완료율로 바꾸지는 마.'},
)
// v3 stores a displayed draft as a versioned object. Same approved terms as the
// preserved textual fixture, plus explicit confirmation instead of compound prose.
const approved = fixtures.find(x=>x.id==='approve-draft')
approved.initial.agent_v2_context={version:3,draft:{id:'reading-fixture-v1',presentedMessageId:'a',card:{...emptyGoal,category:'독서',outcome:'독서 습관 만들기',durationWeeks:2,targetMetric:'2주간 6회 실행',weeklyActions:[{title:'독서',frequencyPerWeek:3,durationMinutes:10,preferredDays:[]}]}}}
approved.message='그 초안 그대로 시작할게'

function prepare() {
  mkdirSync(folder,{recursive:true});mkdirSync(functionDir,{recursive:true})
  const runId=new Date().toISOString().replace(/[:.]/g,'-'), runFolder=resolve(folder,runId)
  mkdirSync(runFolder,{recursive:true})
  const token=randomBytes(32).toString('hex'),expires=Date.now()+7200000
  write(resolve(folder,'config.local.json'),{token,expires,runFolder})
  write(resolve(runFolder,'manifest.json'),{runId,expires,sourceHashes:sourceHashes(),fixtures,model:'gpt-4.1-2025-04-14',limitUsd:2,resultPrefix:process.argv.includes('--latency')?'agent-goal-latency':undefined,notes:['Identical legacy fixtures except approval now contains the versioned displayed draft and a simple unqualified acceptance.','Unknown rhythm fields are represented explicitly rather than absent records. Criteria compare known time values.','Temporary function imports the production core directly; no database access.','No 429 retries; record failures as observed.']})
  writeFileSync(resolve(functionDir,'index.ts'),`import {loadState,runAgentTurn} from '../onju-agent-v2/agent.ts'
Deno.serve(async req=>{const usage:unknown[]=[];try{
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(req.headers.get('x-eval-token')||''));
 if(Date.now()>${expires}||Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('')!=='${hash(token)}')return new Response('forbidden',{status:403});
 const body=await req.json();if(JSON.stringify(body).length>100000)return new Response('invalid',{status:400});
 const result=await runAgentTurn(loadState(body.initial),body.message,{now:'2026년 9월 4일 금요일 오전 9:00',model:'gpt-4.1-2025-04-14',request:async data=>{
  const start=Date.now();const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+Deno.env.get('OPENAI_API_KEY'),'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(45000)});
  if(!res.ok)throw new Error('openai_'+res.status);const out=await res.json();usage.push({model:out.model,usage:out.usage,elapsedMs:Date.now()-start,output:out.output});return out;
 }});return Response.json({...result,usage});
 }catch(error){return Response.json({error:String(error),usage},{status:500})}})
`)
  console.log('Prepared quality run:',runId)
}
function evaluate(id,r) {
  if(r.error)return {completed:false}
  const s=r.state,b=s.blocks,card=s.goal_card,reply=r.assistant_message
  const bound=day=>s.day_bounds.find(b=>b.days.includes(day))
  const has=(days,start,end)=>days.every(day=>b.some(x=>x.days.includes(day)&&x.start===start&&x.end===end))
  const blankPlan=!card.durationWeeks&&!card.targetMetric&&!card.weeklyActions.length&&!card.baselineMetric
  const draft=s.agent_v2_context.draft,proposal=draft?.card
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
  const minutes=proposal?.weeklyActions.reduce((sum,a)=>sum+a.frequencyPerWeek*a.durationMinutes,0)
  const checks={completed:true,paragraphs:reply.includes('\n\n'),oneQuestion:(reply.match(/[?？]/g)||[]).length<=1}
  const rules={
    'execution-percent':()=>({percent:proposal?.execution?.completionPercent===80,denominator:proposal?.targetMetric==='2주간 계획한 기본 실행 6회 중 5회 이상 완료 (80% 기준·올림)',review:proposal?.reviewCycle==='매주 실행 기록 점검 · 2주 시험 종료 시 전체 점검',guides:!!proposal&&!executionIssue(proposal),minimumSeparate:/기본 실행 완료 횟수에는 넣지/.test(reply)}),
    'execution-korean-number':()=>({unchanged:same(card,executionReading),frequency:proposal?.weeklyActions[0].frequencyPerWeek===1,originalTarget:proposal?.targetMetric===executionReading.targetMetric,relatedDenominator:/기본 실행 2회 중 2회/.test(draft?.related?.card?.targetMetric??'')}),
    'execution-correction':()=>({unchanged:same(card,executionReading),sevenMinutes:proposal?.weeklyActions[0].durationMinutes===7,otherTerms:proposal?.targetMetric===executionReading.targetMetric&&same(proposal?.execution,executionReading.execution)}),
    'execution-minimum':()=>({unchanged:same(card,executionReading),minimum:!!proposal?.execution?.actions[0].minimumAction.includes('제목'),onlyMinimum:proposal?.execution?.actions[0].minimumMinutes===1&&same(proposal?.weeklyActions,executionReading.weeklyActions)&&proposal?.durationWeeks===2&&proposal?.targetMetric===executionReading.targetMetric}),
    'execution-custom-outcome':()=>({custom:proposal?.execution?.measurement==='custom_outcome'&&proposal?.execution?.completionPercent===null,keepsOutcome:/2,?000/.test(proposal?.targetMetric??''),guides:!!proposal&&!executionIssue(proposal)}),
    'goal-only-frequency':()=>({confirmedUnchanged:same(card,three),onlyFrequency:same(proposal,{...three,weeklyActions:[{...three.weeklyActions[0],frequencyPerWeek:1},...three.weeklyActions.slice(1)]}),noUnneededRelated:!draft?.related,diff:!!draft?.changes?.length}),
    'goal-related-count':()=>({confirmedUnchanged:same(card,reading),requestedTargetPreserved:proposal?.targetMetric===reading.targetMetric,relatedSeparate:draft?.related?.card?.targetMetric==='2주간 2회',requiresChoice:r.suggestions.includes('관련 조건도 함께 조정할게요')}),
    'goal-duration-only':()=>({confirmedUnchanged:same(card,reading),onlyDuration:same(proposal,{...reading,weeklyActions:[{...reading.weeklyActions[0],durationMinutes:5}]}),noUnneededRelated:!draft?.related}),
    'goal-small-budget':()=>({small:minutes<=50&&proposal?.weeklyActions.every(a=>a.durationMinutes<=10),dailyBudgetFits:!!proposal&&fitsDailyCapacity(proposal,[10,10,10,10,10,0,0])===true,noInventedDeadline:proposal?.deadline==='',consistentHeadline:!!proposal&&!initialGoalProseIssue(proposal),fallback:!!proposal?.fallbackAction,draftOnly:blankPlan}),
    'goal-light-first':()=>({light:minutes<=90&&proposal?.weeklyActions.every(a=>a.durationMinutes<=15&&a.frequencyPerWeek<=3),consistentHeadline:!!proposal&&!initialGoalProseIssue(proposal),fallback:!!proposal?.fallbackAction,draftOnly:blankPlan}),
    'goal-explicit-long':()=>({requestedLong:proposal?.weeklyActions.some(a=>a.durationMinutes===60&&a.frequencyPerWeek===3),period:proposal?.durationWeeks===2,draftOnly:blankPlan}),
    'two-blocks':()=>({separateBlocks:b.length===2&&has([0,1,2,3,4],'06:30','08:30')&&has([0,1,2,3,4],'08:30','17:30'),noRepeatedRhythm:!/(기상|취침|일어나|잠드)/.test(reply.split('\n\n').at(-1))}),
    'unknown-weekend':()=>({knownWeekdays:[0,1,2,3,4].every(d=>bound(d)?.wake==='06:00'&&bound(d)?.bedtime==='23:00'),noInventedWeekend:[5,6].every(d=>!bound(d)?.wake&&!bound(d)?.bedtime),scheduleFocus:s.stage===1,noDeferredQuestion:!/(주말|토요일|일요일).*(기상|취침|잠드)/.test(reply.split('\n\n').at(-1))}),
    'partial-sleep':()=>({saturday:bound(5)?.wake==='08:00'&&bound(5)?.bedtime==='00:00',sundayNotGuessed:!bound(6)?.bedtime,stillRhythm:s.stage===0,askExactSunday:/일요일.*잠드/.test(reply.split('\n\n').at(-1))}),
    'correct-wednesday':()=>({corrected:b.length===2&&has([0,1,3,4],'09:00','18:00')&&has([2],'09:00','17:00')}),
    'schedule-done':()=>({goalsFocus:s.stage===5,goalQuestion:/목표|분야|변화/.test(reply)}),
    'three-goals':()=>({goalsFocus:s.stage===5,draftOnly:blankPlan&&!!s.agent_v2_context.draft,threeDomains:/일/.test(reply)&&/건강/.test(reply)&&/신앙/.test(reply),choices:r.suggestions.length===2}),
    'approve-draft':()=>({exactApprovedCard:JSON.stringify(card)===JSON.stringify(approved.initial.agent_v2_context.draft.card),noDraft:s.agent_v2_context.draft===null,noModelCost:r.usage.length===0}),
    'reject-draft':()=>({draftOnly:blankPlan&&!!s.agent_v2_context.draft,choices:r.suggestions.length===2}),
    'overnight':()=>({fullInterval:has([4],'23:00','24:00')&&has([5],'00:00','01:00'),accurateReceipt:/23:00–24:00/.test(reply)&&/00:00–01:00/.test(reply)}),
  }
  const initial=fixtures.find(f=>f.id===id)?.initial
  const newDraft=proposal&&!(initial?.goal_card?.weeklyActions?.length)&&id!=='approve-draft'
  return {...checks,...rules[id](),...(newDraft?{executionDetails:!executionIssue(proposal),canonicalReview:proposal.reviewCycle===synchronizeExecution(proposal).reviewCycle}: {})}
}
function meter(r) {
  return (r.usage||[]).reduce((a,e)=>{const i=e.usage.input_tokens,c=e.usage.input_tokens_details?.cached_tokens||0,o=e.usage.output_tokens;return {input:a.input+i,cached:a.cached+c,output:a.output+o,calls:a.calls+1,usd:a.usd+((i-c)*2+c*.5+o*8)/1e6,uncachedUsd:a.uncachedUsd+(i*2+o*8)/1e6}},{input:0,cached:0,output:0,calls:0,usd:0,uncachedUsd:0})
}
async function run() {
  const config=json(resolve(folder,'config.local.json')),manifest=json(resolve(config.runFolder,'manifest.json'))
  if(JSON.stringify(sourceHashes())!==JSON.stringify(manifest.sourceHashes))throw Error('Frozen source changed; prepare a new run.')
  const env=Object.fromEntries(readFileSync(resolve(root,'.env.local'),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}))
  const resultsFile=resolve(config.runFolder,'results.json'),results=existsSync(resultsFile)?json(resultsFile):[]
  const limit=Number(process.argv.find(x=>x.startsWith('--repeats='))?.split('=')[1]||2)
  const only=process.argv.find(x=>x.startsWith('--only='))?.slice(7).split(',')
  for(let rep=0;rep<limit;rep++)for(const f of fixtures){
    if(only&&!only.includes(f.id))continue
    if(results.some(r=>r.rep===rep&&r.id===f.id))continue
    if(results.reduce((s,r)=>s+r.cost.usd,0)>=manifest.limitUsd)throw Error('Cost ceiling reached')
    const start=performance.now();let result
    try{const response=await fetch(env.VITE_SUPABASE_URL+'/functions/v1/onju-agent-quality-eval',{method:'POST',headers:{'Content-Type':'application/json',apikey:env.VITE_SUPABASE_ANON_KEY,Authorization:'Bearer '+env.VITE_SUPABASE_ANON_KEY,'x-eval-token':config.token},body:JSON.stringify({message:f.message,initial:f.initial}),signal:AbortSignal.timeout(150000)});result=await response.json()}
    catch(error){result={error:String(error),usageUnknown:true}}
    const checks=evaluate(f.id,result),cost=meter(result),entry={id:f.id,rep,elapsedMs:performance.now()-start,checks,pass:Object.values(checks).every(Boolean),cost,result}
    results.push(entry);write(resultsFile,results)
    console.log(JSON.stringify({id:f.id,rep:rep+1,pass:entry.pass,failed:Object.entries(checks).filter(([,v])=>!v).map(([k])=>k),seconds:+(entry.elapsedMs/1000).toFixed(2),usd:cost.usd,calls:cost.calls,error:result.error}))
    await new Promise(resolve=>setTimeout(resolve,8000))
  }
  exportResults()
}
function exportResults(){
  const config=json(resolve(folder,'config.local.json')),manifest=json(resolve(config.runFolder,'manifest.json')),results=json(resolve(config.runFolder,'results.json'))
  const measured=results.filter(r=>r.id!=='approve-draft'&&!r.id.startsWith('goal-')&&!r.id.startsWith('execution-')),old=baseline.results.filter(r=>r.model==='gpt-4.1-2025-04-14'&&r.id!=='approve-draft')
  const stats=arr=>{const sorted=arr.map(r=>r.elapsedMs/1000).sort((a,b)=>a-b),n=arr.length;return {n,pass:arr.filter(r=>r.pass).length,meanUsd:arr.reduce((s,r)=>s+r.cost.usd,0)/n,meanUncachedUsd:arr.reduce((s,r)=>s+r.cost.uncachedUsd,0)/n,meanCalls:arr.reduce((s,r)=>s+r.cost.calls,0)/n,meanSeconds:sorted.reduce((sum,n)=>sum+n,0)/n,meanOutputTokens:arr.reduce((sum,r)=>sum+r.cost.output,0)/n,meanReplyCharacters:arr.reduce((sum,r)=>sum+(r.result?.assistant_message?.length||0),0)/n,medianSeconds:n%2?sorted[Math.floor(n/2)]:(sorted[n/2-1]+sorted[n/2])/2}}
  const summary={all:{n:results.length,pass:results.filter(r=>r.pass).length,usd:results.reduce((s,r)=>s+r.cost.usd,0)},before:stats(old),after:stats(measured)}
  if(manifest.resultPrefix==='agent-goal-latency'){
    const previous=json(resolve(root,'docs/evals/agent-goal-execution-2026-09-04T04-30-27-696Z.json'))
    const ids=['three-goals','reject-draft','goal-small-budget','goal-light-first','goal-explicit-long','execution-percent','execution-custom-outcome']
    summary.matchedComparison={baselineRunId:previous.manifest.runId,notes:'Same frozen scenarios; baseline once per scenario, revised run as specified. Wall-clock includes API/network variation. Not the unrelated legacy before/after table.',allBefore:stats(previous.results),allAfter:stats(results),newDraftBefore:stats(previous.results.filter(r=>ids.includes(r.id))),newDraftAfter:stats(results.filter(r=>ids.includes(r.id))),cases:ids.map(id=>({id,before:stats(previous.results.filter(r=>r.id===id)),after:stats(results.filter(r=>r.id===id))}))}
  }
  const prefix=manifest.resultPrefix||(manifest.fixtures.some(f=>f.id.startsWith('execution-'))?'agent-goal-execution':manifest.fixtures.some(f=>f.id.startsWith('goal-'))?'agent-goal-design':'agent-quality')
  write(resolve(root,`docs/evals/${prefix}-2026-09-04.json`),{manifest,summary,results});console.log(JSON.stringify(summary,null,2))
  write(resolve(root,`docs/evals/${prefix}-${manifest.runId}.json`),{manifest,summary,results})
}
const mode=process.argv[2]
function finalize() {
  const baseRun=process.argv.find(x=>x.startsWith('--base-run='))?.slice(11)
  if(!baseRun||!/^\d{4}-\d{2}-\d{2}T[\d-]+Z$/.test(baseRun))throw Error('Expected --base-run=archived-run-id')
  const previous=json(resolve(root,`docs/evals/agent-goal-latency-${baseRun}.json`))
  const config=json(resolve(folder,'config.local.json')),manifest=json(resolve(config.runFolder,'manifest.json')),targeted=json(resolve(config.runFolder,'results.json'))
  if(JSON.stringify(sourceHashes())!==JSON.stringify(manifest.sourceHashes))throw Error('Final source changed')
  if(JSON.stringify(previous.manifest.fixtures)!==JSON.stringify(manifest.fixtures))throw Error('Fixture drift')
  const affected=manifest.fixtures.filter(f=>!f.initial?.goal_card?.weeklyActions?.length&&requestedSingleSession(f.message)).map(f=>f.id)
  const revalidated=[...new Set(targeted.map(r=>r.id))]
  const results=previous.results.filter(r=>!revalidated.includes(r.id)).map(r=>({...r,sourceRunId:baseRun})).concat(targeted.map(r=>({...r,sourceRunId:manifest.runId})))
  const keys=new Set(results.map(r=>`${r.id}:${r.rep}`))
  if(previous.results.length!==40||results.length!==40||keys.size!==40||affected.some(id=>!targeted.some(r=>r.id===id&&r.rep===0)||!targeted.some(r=>r.id===id&&r.rep===1)))throw Error('Incomplete regression matrix')
  const value={finalSourceHashes:manifest.sourceHashes,baseRunId:baseRun,targetedRunId:manifest.runId,affectedCases:affected,revalidatedCases:revalidated,
    method:`Full 20-case x 2 run, followed by targeted reruns of every affected input plus a completion-percentage control. The ${previous.results.filter(r=>!revalidated.includes(r.id)).length} other rows retain their original provenance; this is not a claim that all 40 calls used the final source hash.`,
    summary:{n:results.length,pass:results.filter(r=>r.pass).length,basePass:previous.summary.all.pass,targetedPass:targeted.filter(r=>r.pass).length,targetedN:targeted.length},results}
  write(resolve(root,'docs/evals/agent-goal-latency-verification-2026-09-04.json'),value)
  console.log(JSON.stringify({summary:value.summary,affectedCases:affected}))
  if(value.summary.pass!==40)process.exitCode=1
}
if(mode==='prepare')prepare()
else if(mode==='run')await run()
else if(mode==='export')exportResults()
else if(mode==='finalize')finalize()
else throw Error('Usage: verify-agent-quality.mjs prepare|run|export [--repeats=2]')
