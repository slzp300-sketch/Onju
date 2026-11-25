import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyBrief, updateGoalBrief, loadGoalBrief, resolveGoalPeriod, extractDecidedGoalPeriod } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import { goalFactIsAsserted } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalEvidenceScope.ts'
import { explicitAreaChange, periodUpdateIsExplicit } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalIntakeEvidence.ts'
import { assessGoalFeasibility, nextGoalIntakeStep, goalFeasibilityIssue, parseGoalQuantity } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalFeasibility.ts'

const seed = () => ({ ...emptyBrief(), period: {label:'4 weeks',weeks:4}, areas:['reading'],
  baselines:[{area:'reading',current:'1 book per week',evidence:'1 book per week',status:'known'}],
  objectives:[{area:'reading',result:'4 books',evidence:'4 books',resultKind:'metric'}],
  capacity:{summary:'1 hour per week',evidence:'1 hour per week',status:'known'} })

// Match both narrow quotations and whole-message evidence. In particular,
// a separate question must not invalidate a decided fact or license a proposal.
for (const [message, value, expected] of [
  ['책 6권 완독은 안 할래. 원래 목표를 유지해줘.','책 6권 완독',false],
  ['책 6권 완독을 할래.','책 6권 완독',true],
  ["I can't spend 3 hours per week. Keep the old time budget.",'3 hours per week',false],
  ['I can spend 3 hours per week.','3 hours per week',true],
  ['Don’t move the deadline to November 30, 2026.','November 30, 2026',false],
  ['Move the deadline to November 30, 2026.','November 30, 2026',true],
  ['If the client delays the launch, change the period to 12 weeks. No change for now.','12 weeks',false],
  ['Change the period to 12 weeks now.','12 weeks',true],
  ['동료는 프로젝트 5개를 완성했대. 나는 아직 프로젝트 1개야.','프로젝트 5개',false],
  ['동료는 프로젝트 5개를 완성했대. 나는 아직 프로젝트 1개야.','프로젝트 1개',true],
  ["My colleague's goal is 8 articles. Keep my original goal.",'8 articles',false],
  ['My goal is 8 articles.','8 articles',true],
  ['작년에는 책 0권을 읽었어. 그때는 육아 때문에 어려웠지.','책 0권',false],
  ['작년에는 책 0권을 읽었어. 지금은 책 1권이야.','책 1권',true],
  ['최근 완성한 영상은 2편이야. 다음에는 뭘 할까?','2편',true],
  ['영상은 2편으로 할까? 지금은 기간부터 정하자.','2편',false],
  ['주당 2시간 가능해. 어떤 요일로 나누면 좋을까?','주당 2시간',true],
  ['I would like to finish 4 books.','4 books',true],
  ['Would 4 books be enough?','4 books',false],
  ['일본어와 독서 목표를 8주 동안 할게.','8주',true],
  ['무리하지 않고 4편 완성으로 줄일게.','4편 완성',true],
  ['4편 완성은 하지 않을래.','4편 완성',false],
  ['4주 말고 8주로 늘릴게.','8주',true],
  ['4주 말고 8주로 늘릴게.','4주',false],
]) for (const evidence of [...new Set([value,message])]) {
  test('scoped authority: '+message+' / '+evidence,()=>assert.equal(goalFactIsAsserted(message,evidence,value),expected))
}

for (const [message,area,action] of [
  ['일본어는 제외해줘. 독서는 어떤 책이 좋을까?','일본어','remove'],
  ['일본어는 제외해줘. 독서는 어떤 책이 좋을까?','독서',null],
  ['Remove drawing, but keep writing.','drawing','remove'],
  ['Remove drawing, but keep writing.','writing',null],
  ['Should I remove drawing? Keep writing.','drawing',null],
  ['If I have less time, remove drawing.','drawing',null],
]) test('action stays with its target: '+message+' / '+area,()=>assert.equal(explicitAreaChange(area,message,['일본어','독서','drawing','writing']),action))

for (const [evidence,normalized] of [
  ['November 30, 2026','2026-11-30'],['30 November 2026','2026-11-30'],
  ['2026-11-30까지','2026-11-30'],['2026년 11월 30일까지','2026-11-30'],
  ['by the end of this year','2026-12-31'],['by the end of next year','2027-12-31'],
]) test('deadline is grounded, not trusted normalization: '+evidence,()=> {
  assert.equal(resolveGoalPeriod({evidence,normalized,kind:'deadline'},'2026-09-16')?.deadline,normalized)
  assert.equal(resolveGoalPeriod({evidence,normalized:'2027-01-01',kind:'deadline'},'2026-09-16'),null)
})
for (const [evidence,normalized] of [
  ['February 31, 2027','2027-03-03'],['2026-11-30 or 2026-12-31','2026-12-31'],
  ['sometime after launch','2026-12-31'],
]) test('ambiguous/invalid deadline fails closed: '+evidence,()=>assert.equal(resolveGoalPeriod({evidence,normalized,kind:'deadline'},'2026-09-16'),null))

for (const [evidence,normalized,weeks] of [
  ['두 달 반','11 weeks',11],['2.5 months','11 weeks',11],['two and a half months','11 weeks',11],['1.5 weeks','2 weeks',2],
]) test('fractional duration: '+evidence,()=> {
  assert.equal(resolveGoalPeriod({evidence,normalized,kind:'duration'})?.weeks,weeks)
  assert.equal(resolveGoalPeriod({evidence,normalized:'8 weeks',kind:'duration'}),null)
})
test('direct capture never truncates a fractional month',()=> {
  assert.equal(extractDecidedGoalPeriod('기간은 두 달 반으로 늘릴게.')?.weeks,11)
  assert.equal(extractDecidedGoalPeriod('기간은 2.5개월로 할게.')?.weeks,11)
  assert.equal(periodUpdateIsExplicit('4주 말고 8주로 늘릴게.','8주'),true)
})

for (const [text,rate] of [['주 2회',2],['2 articles every fortnight',1],['2 articles fortnightly',1],['2 articles every 2 weeks',1],['주당 0분 가능해.',0],['0 hours per week',0],['하루 약 20분',140]]) {
  test('equivalent frequency: '+text,()=>assert.equal(parseGoalQuantity(text)?.perWeek,rate))
}
for (const text of ['2 articles every cycle','2 articles per sprint','2 articles biweekly','격월 2편','2 articles every fortnight or per sprint']) {
  test('unsupported frequency cannot become cumulative: '+text,()=>assert.equal(parseGoalQuantity(text),null))
}
for (const summary of ['주당 0분 가능해.','0 hours per week','주 0회 가능해.']) {
  test('zero capacity cannot be bypassed by accepting strain: '+summary,()=> {
    const brief={...seed(),capacity:{summary,evidence:summary,status:'known'},feasibilityAcceptance:{evidence:'Keep it',note:'Keep it'}}
    assert.equal(assessGoalFeasibility(brief).status,'strained')
    assert.equal(nextGoalIntakeStep(brief,null),'feasibility')
    const card={weeklyActions:[{frequencyPerWeek:1,durationMinutes:10}],execution:{progressStrategy:'첫 주 실제 시간을 기록하고 다음 주 다시 제안합니다.'}}
    assert.match(goalFeasibilityIssue(card,brief),/goal_capacity_conflict/)
  })
}
for (const [summary,planned,expected] of [['주 2회 20분',20,null],['주 2회 20분',40,/goal_capacity_conflict/],['주 2회 20분',41,/goal_capacity_conflict/],['하루 약 20분',140,/goal_capacity_conflict/],['1 hour per week',61,/goal_capacity_conflict/]]) {
  test('shared capacity guard: '+summary+' / '+planned,()=> {
    const brief={...seed(),capacity:{summary,evidence:summary,status:'known'}}
    const card={weeklyActions:[{frequencyPerWeek:1,durationMinutes:planned}],execution:{progressStrategy:'첫 주 실제 시간을 기록하고 다음 주 다시 제안합니다.'}}
    const issue=goalFeasibilityIssue(card,brief)
    if(expected)assert.match(issue,expected);else assert.equal(issue,null)
  })
}
test('restoring a goal never restores deleted details, including later turns after reload',()=> {
  let brief=updateGoalBrief(seed(),{area_changes:[{area:'reading',action:'remove',evidence:'Remove reading.'}]},'Remove reading.')
  brief=updateGoalBrief(brief,{area_changes:[{area:'reading',action:'restore',evidence:'Restore reading.'}]},'Restore reading.')
  brief=loadGoalBrief(JSON.parse(JSON.stringify(brief)))
  const old={baselines:[{area:'reading',current:'1 book per week',evidence:'1 book per week',status:'known'}],objectives:[{area:'reading',result:'4 books',evidence:'4 books',result_kind:'metric'}]}
  const rejected=updateGoalBrief(brief,old,'I have not decided the details yet.',['1 book per week','4 books'])
  assert.deepEqual(rejected.baselines,[])
  assert.deepEqual(rejected.objectives,[])
  const fresh=updateGoalBrief(rejected,old,'I read 1 book per week and my target is 4 books.')
  assert.equal(fresh.baselines.length,1)
  assert.equal(fresh.objectives.length,1)
  assert.deepEqual(loadGoalBrief(JSON.parse(JSON.stringify(fresh))),fresh)
})
test('zero completed practice needs calibration, not zero-capacity or infinite-ratio rejection',()=> {
  const brief={...seed(),baselines:[{area:'reading',current:'현재 주 0회',status:'known'}],objectives:[{area:'reading',result:'4주간 8회'}]}
  assert.equal(assessGoalFeasibility(brief).status,'needs_rate')
  assert.equal(nextGoalIntakeStep(brief,null),null)
  const card={weeklyActions:[{frequencyPerWeek:2,durationMinutes:10}],execution:{progressStrategy:'첫 주 실제 시간을 기록하고 다음 주 다시 제안합니다.'}}
  assert.equal(goalFeasibilityIssue(card,brief),null)
})
