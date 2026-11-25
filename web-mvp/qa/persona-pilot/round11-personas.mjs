// Authored fictional cases, not real people or generated model conversations.
// Ten scenario families have Korean/English counterparts. Expectations are
// written before execution and kept separate from the product implementation.
const kr={locale:'ko-KR',countryCode:'KR',timeZone:'Asia/Seoul',currencyCode:'KRW',weekStartsOn:1}
const zones=['America/New_York','America/Chicago','America/Denver','America/Los_Angeles']
const us=i=>({locale:'en-US',countryCode:'US',timeZone:zones[i%4],currencyCode:'USD',weekStartsOn:0})
const baseline=(area,current,evidence=current)=>({area,current,evidence,status:'known'})
const objective=(area,result,evidence=result)=>({area,result,evidence,result_kind:'metric'})
const capacity=(summary,evidence=summary,status='known')=>({summary,evidence,status})
const turn=(message,candidate,expect)=>({message,candidate,expect})
const probe=(id,message,candidate,expect,kind='intended-extraction',seedAfterTurn=4)=>({id,message,candidate,expect,kind,seedAfterTurn})
const control=(...args)=>({...probe(...args),kind:'paired-control'})
const invalid=(id,message,candidate,expect)=>probe(id,message,candidate,{accepted:false,...expect},'invalid-model-candidate')
const agent=entry=>({...entry,candidateKind:entry.kind,question:/[가-힣]/.test(entry.message)?'이 조건을 바탕으로 이어갈까요?':'Shall we continue with these conditions?'})
const safeAgent=entry=>({...agent(entry),expect:{...entry.expect,accepted:'either'},expectNoChange:true})
const bounds=value=>value===null?null:typeof value==='number'?{min:value,max:value}:value
const budget=(id,text,minutes,count=null,session=null,extras={})=>({id,text,expected:{status:'bounded',weeklyMinutes:bounds(minutes),weeklySessions:bounds(count),perSessionMinutes:bounds(session)},...extras})
const unresolved=(id,text)=>({id,text,expected:{status:'unresolved',weeklyMinutes:null,weeklySessions:null,perSessionMinutes:null}})
const draft=(id,text,minutes,expectIssue,extras={})=>({id,capacityCorrection:text,frequency:1,minutes,expectIssue,seedAfterTurn:4,...extras})
const spec=[
  {ids:['KR-96','US-91'],ages:[26,28],profiles:['26세 병동 간호사 / 근무가 없는 날 영어 공부','28세 미국 병원 기술자 / 요일별 자격 공부'],family:'abbreviated-days',areas:['학습','learning'],current:['자료 1개','1 project'],result:['자료 4개','4 projects'],situation:'월·수·금 / Mon, Wed, Fri 같은 반복 요일 약어를 주간 총량과 배치에 함께 반영한다.'},
  {ids:['KR-97','US-92'],ages:[39,43],profiles:['39세 지방 현장 엔지니어 / 격주 귀가 후 포트폴리오','43세 미국 출장 기사 / 격주 개인 프로젝트'],family:'alternating-weeks',areas:['코딩','coding'],current:['프로젝트 1개','1 project'],result:['프로젝트 4개','4 projects'],situation:'격주 90분과 그 사이 0분을 모든 주에 45분 가능한 것으로 평균내지 않는다.'},
  {ids:['KR-98','US-93'],ages:[33,36],profiles:['33세 육아 병행 직장인 / 짧은 독서 창','36세 미국 한부모 / 독서 총량과 하루 제한'],family:'independent-caps',areas:['독서','reading'],current:['책 1권','1 book'],result:['책 4권','4 books'],situation:'주 전체 60분과 하루 최대 20분을 동시에 지키며 한쪽만 느슨하게 만들지 않는다.'},
  {ids:['KR-99','US-94'],ages:[25,24],profiles:['25세 디자이너 / 디자인과 코딩별 별도 예산','24세 미국 UX 개발자 / 두 목표의 별도 시간'],family:'area-budget-scope',situation:'한 목표에만 해당하는 시간을 모든 목표가 공유하는 총 가용 시간으로 저장하지 않는다.'},
  {ids:['KR-100','US-95'],ages:[45,47],profiles:['45세 자영업자 / 영업시간 변경 후 여유 미측정','47세 미국 소상공인 / 바뀐 근무 후 시간 재측정'],family:'measurement-reset',areas:['글쓰기','writing'],current:['글 1편','1 article'],result:['글 4편','4 articles'],situation:'이전의 숫자 예산을 철회하고 미측정으로 바꾸되 목표와 기간은 유지한다.'},
  {ids:['KR-101','US-96'],ages:[29,31],profiles:['29세 마케터 / 친구의 습관 사례를 인용','31세 미국 영업직 / 동료의 경험을 인용'],family:'quoted-other-person',areas:['독서','reading'],current:['책 1권','1 book'],result:['책 4권','4 books'],situation:'인용문 안의 1인칭 가용 시간을 실제 발화자의 시간으로 오해하지 않는다.'},
  {ids:['KR-102','US-97'],ages:[27,30],profiles:['27세 이직 준비생 / 남은 포트폴리오 작업','30세 미국 경력 전환자 / 남은 프로젝트'],family:'remaining-is-not-completed',areas:['포트폴리오','portfolio'],current:['프로젝트 1개','1 project'],result:['프로젝트 8개','8 projects'],situation:'완료 3개와 남은 5개를 구분하고 남은 수량을 완료 실적으로 저장하지 않는다.'},
  {ids:['KR-103','US-98'],ages:[41,38],profiles:['41세 번역가 / 앞서 말한 가용 시간 정정','38세 미국 편집자 / 잘못 말한 시간 바로잡기'],family:'same-turn-correction',areas:['글쓰기','writing'],current:['글 1편','1 article'],result:['글 4편','4 articles'],situation:'같은 발언에서 기존 60분을 철회하고 30분으로 정정하면 최신 값만 저장한다.'},
  {ids:['KR-104','US-99'],ages:[22,21],profiles:['22세 아르바이트 대학생 / 요일별 시간 범위','21세 미국 근로 장학생 / 평일·주말 시간 범위'],family:'disjoint-ranges',areas:['학습','learning'],current:['자료 1개','1 project'],result:['자료 4개','4 projects'],situation:'평일 10~15분과 주말 20~30분의 서로 다른 범위와 상한을 유지한다.'},
  {ids:['KR-105','US-100'],ages:[35,40],profiles:['35세 맞벌이 직장인 / 두 목표가 공유하는 시간','40세 미국 재택근무자 / 개인 목표의 총 시간'],family:'shared-total-budget',situation:'목표마다 주간 예산을 복제하지 않고 여러 행동의 총합으로 한도를 검사한다.'},
]

function journey(ko,area,current,result,resultFirst) {
  const duration=ko?'8주':'8 weeks',time=ko?'주당 1시간 가능해.':'I can spend 1 hour per week.'
  const period={kind:'duration',normalized:duration,evidence:duration},areas=[{name:area,evidence:area}]
  const steps=resultFirst?[
    turn(ko?`${area} 목표는 ${result}으로 할게.`:`For ${area}, my target is ${result}.`,{areas,objectives:[objective(area,result)]},{areas:[area],missing:'period'}),
    turn(ko?`기간은 ${duration}로 할게.`:`I choose ${duration}.`,{period},{'period.weeks':8,missing:'baseline'}),
    turn(ko?`현재 ${current}를 완료했어.`:`I have completed ${current}.`,{baselines:[baseline(area,current)]},{'baselines.0.current':current,missing:'capacity'}),
  ]:[
    turn(`${area}: ${duration}`,{areas,period},{areas:[area],'period.weeks':8,missing:'baseline'}),
    turn(ko?`현재 ${current}를 완료했어.`:`I have completed ${current}.`,{baselines:[baseline(area,current)]},{'baselines.0.current':current,missing:'result'}),
    turn(ko?`${result}으로 목표를 정할게.`:`My goal is ${result}.`,{objectives:[objective(area,result)]},{'objectives.0.result':result,missing:'capacity'}),
  ]
  return [...steps,turn(time,{capacity:capacity(time)},{'capacity.summary':time,missing:null})]
}
function twoGoals(ko) {
  const a=ko?'디자인':'design',b=ko?'코딩':'coding',one=ko?'프로젝트 1개':'1 project',four=ko?'프로젝트 4개':'4 projects',duration=ko?'8주':'8 weeks'
  const priority=ko?'두 목표는 같은 우선순위야.':'Both goals have equal priority.',time=ko?'주당 1시간 가능해.':'I can spend 1 hour per week.'
  return [
    turn(`${a}, ${b}, ${duration}`,{areas:[{name:a,evidence:a},{name:b,evidence:b}],period:{kind:'duration',normalized:duration,evidence:duration}},{areas:[a,b],missing:'baseline'}),
    turn(`${a}: ${one}. ${b}: ${one}.`,{baselines:[baseline(a,one),baseline(b,one)]},{missing:'result'}),
    turn(`${a}: ${four}. ${b}: ${four}.`,{objectives:[objective(a,four),objective(b,four)]},{missing:'priority'}),
    turn(priority+' '+time,{priority:{mode:'equal',primary_area:'',flexible_areas:[],evidence:priority},capacity:capacity(time)},{missing:null}),
  ]
}
function build(row,language,index) {
  const ko=language===0,area=row.areas?.[language],current=row.current?.[language],result=row.result?.[language]
  const oldTime=ko?'주당 1시간 가능해.':'I can spend 1 hour per week.'
  const p={id:row.ids[language],age:row.ages[language],synthetic:true,context:ko?kr:us(index),profile:row.profiles[language],family:row.family,situation:row.situation,
    steps:area?journey(ko,area,current,result,index%2===0):twoGoals(ko),probes:[],capacityProbes:[],draftProbes:[],agentProbes:[]}
  const capProbe=(id,text,summary=text)=>probe(id,text,{capacity:capacity(summary,text)},{'capacity.summary':summary,next:null})
  if(row.family==='abbreviated-days') {
    const text=ko?'매주 월·수·금에 20분씩 가능해.':'I can spend 20 minutes every Mon, Wed, Fri.'
    const full=ko?'월요일과 수요일과 금요일 매일 20분':'20 minutes every Monday, Wednesday and Friday'
    p.probes=[capProbe('abbreviated-days',text),control('full-names',full,{capacity:capacity(full)},{next:null})]
    p.capacityProbes=[budget('abbreviated-days',text,60,null,null,{dailyMinutes:[20,0,20,0,20,0,0]}),budget('full-names',full,60)]
    p.draftProbes=[draft('allowed-monday',text,20,null,{preferredDays:[0]}),draft('excluded-tuesday',text,5,'goal_capacity_conflict',{preferredDays:[1]})]
  } else if(row.family==='alternating-weeks') {
    const text=ko?'격주로 90분 가능하고 그 사이 주에는 0분이야.':'I have 90 minutes every other week, and zero minutes in the intervening weeks.'
    const average=ko?'주당 45분':'45 minutes per week'
    p.probes=[invalid('average-cannot-become-weekly-availability',text,{capacity:capacity(average,text)},{'capacity.summary':oldTime}),
      control('steady-weekly-control',ko?'매주 45분 가능해.':'I have 45 minutes every week.',{capacity:capacity(ko?'매주 45분':'45 minutes every week')},{next:null})]
    p.capacityProbes=[unresolved('alternating-week-needs-calendar',text),budget('steady-weekly-control',ko?'매주 45분':'45 minutes every week',45)]
    p.draftProbes=[draft('do-not-place-identically-every-week',text,45,'goal_capacity_unresolved',{allowedSetupErrors:['capacity_requires_grounded_measurement']})]
    p.agentProbes=[safeAgent(p.probes[0])]
  } else if(row.family==='independent-caps') {
    const text=ko?'주당 총 60분, 하루 최대 20분 가능해.':'I can spend 60 minutes total per week, at most 20 minutes per day.'
    p.probes=[capProbe('weekly-and-daily',text)]
    p.capacityProbes=[budget('weekly-and-daily',text,60,null,null,{dailyMinutes:Array(7).fill(20)})]
    p.draftProbes=[draft('valid-three-days',text,20,null,{frequency:3,preferredDays:[0,2,4]}),draft('too-long-one-day',text,30,'goal_capacity_conflict',{preferredDays:[0]}),draft('weekly-overflow',text,20,'goal_capacity_conflict',{frequency:4,preferredDays:[0,1,2,3]})]
  } else if(row.family==='area-budget-scope') {
    const text=ko?'디자인에만 주당 80분, 코딩에는 주당 25분을 따로 쓸 수 있어.':'I have 80 minutes per week for design only and a separate 25 minutes per week for coding.'
    const wrong=ko?'주당 80분':'80 minutes per week',total=ko?'두 목표를 합쳐서 총 주당 50분 가능해.':'Across both goals combined, I have 50 minutes per week.'
    p.probes=[invalid('one-area-is-not-global',text,{capacity:capacity(wrong,text)},{'capacity.summary':oldTime}),capProbe('explicit-shared-total',total)]
    p.agentProbes=[safeAgent(p.probes[0]),agent(p.probes[1])]
  } else if(row.family==='measurement-reset') {
    const text=ko?'근무가 바뀌어서 가능한 시간은 아직 측정하지 않았어.':'My shifts changed. I have not measured my available time yet.'
    const summary=ko?'실행 후 가용 시간 측정':'Measure availability after trying'
    const entry=probe('clear-old-measured-budget',text,{capacity:capacity(summary,text,'unmeasured')},{'capacity.status':'unmeasured','capacity.summary':summary,'capacityLimits.status':'unspecified','capacityLimits.weeklyMinutes':null,'capacityLimits.weeklySessions':null,'capacityLimits.perSessionMinutes':null,'period.weeks':8,'objectives.0.result':result,next:null})
    p.steps.push(turn(entry.message,entry.candidate,entry.expect))
    p.probes=[probe('old-time-not-replayed',ko?'그 조건으로 이어가자.':'Continue with those conditions.',{capacity:capacity(oldTime)},{accepted:false,'capacity.status':'unmeasured','capacity.summary':summary},'invalid-model-candidate',5)]
    p.draftProbes=[draft('calibration-without-invented-limit',null,5,null,{seedAfterTurn:5})]
    p.agentProbes=[agent(entry)]
  } else if(row.family==='quoted-other-person') {
    const text=ko?'친구가 "나는 매주 3시간 가능해"라고 했어. 내가 쓸 수 있는 시간은 주당 15분이야.':'My coworker said, "I have 3 hours per week." My own available time is 15 minutes per week.'
    const bad=ko?'매주 3시간':'3 hours per week',good=ko?'주당 15분':'15 minutes per week'
    p.probes=[invalid('quoted-I-is-not-user',text,{capacity:capacity(bad)},{'capacity.summary':oldTime}),control('own-time-after-quotation',text,{capacity:capacity(good)},{'capacity.summary':good,next:null})]
    p.agentProbes=[safeAgent(p.probes[0]),agent(p.probes[1])]
  } else if(row.family==='remaining-is-not-completed') {
    const text=ko?'프로젝트 8개 중 3개는 완료했고 5개는 남았어.':'Of 8 projects, I completed 3 projects and have 5 projects left to do.'
    const bad=ko?'5개':'5 projects',good=ko?'3개':'3 projects'
    p.probes=[invalid('remaining-is-not-completed',text,{baselines:[baseline(area,bad,text)]},{'baselines.0.current':current}),control('completed-portion',text,{baselines:[baseline(area,good,text)]},{'baselines.0.current':good,next:null})]
    p.agentProbes=[safeAgent(p.probes[0]),agent(p.probes[1])]
  } else if(row.family==='same-turn-correction') {
    const text=ko?'주당 60분이라고 했는데 잘못 말했어. 주당 30분으로 정정할게.':'I said 60 minutes per week, but that was wrong. Correct it to 30 minutes per week.'
    const bad=ko?'주당 60분':'60 minutes per week',good=ko?'주당 30분':'30 minutes per week'
    p.probes=[invalid('retracted-capacity',text,{capacity:capacity(bad)},{'capacity.summary':oldTime}),control('corrected-capacity',text,{capacity:capacity(good)},{'capacity.summary':good,next:null})]
    p.agentProbes=[safeAgent(p.probes[0]),agent(p.probes[1])]
  } else if(row.family==='disjoint-ranges') {
    const text=ko?'평일 하루 10~15분; 주말 하루 20~30분':'10 to 15 minutes each weekday; 20 to 30 minutes each weekend day'
    p.probes=[capProbe('disjoint-ranges',text)]
    p.capacityProbes=[budget('disjoint-ranges',text,{min:90,max:135},null,null,{dailyMinutes:[15,15,15,15,15,30,30]})]
    p.draftProbes=[draft('weekday-maximum',text,15,null,{preferredDays:[0]}),draft('weekday-overflow',text,16,'goal_capacity_conflict',{preferredDays:[0]}),draft('weekend-maximum',text,30,null,{preferredDays:[5]})]
  } else if(row.family==='shared-total-budget') {
    const text=ko?'두 목표 전체에 쓸 시간은 합쳐서 주당 60분이야.':'Across both goals combined, I have 60 minutes per week.'
    p.steps.push(turn(text,{capacity:capacity(text)},{next:null}))
    const a=ko?'디자인':'design',b=ko?'코딩':'coding'
    const actions=minutes=>[a,b].map(area=>({area,minutes,frequency:1,preferredDays:[]}))
    p.draftProbes=[draft('combined-total-overflow',null,40,'goal_capacity_conflict',{seedAfterTurn:5,actions:actions(40)}),draft('combined-total-within-limit',null,30,null,{seedAfterTurn:5,actions:actions(30)})]
    p.agentProbes=[agent(capProbe('capture-shared-total',text))]
  }
  return p
}
export const round11Personas=[...spec.map((row,index)=>build(row,0,index)),...spec.map((row,index)=>build(row,1,index))]
export const round11FixtureCorrections=[
  {caseId:'agent-path/inline-capture-result',reason:'정보 수집 후 추가 모델 호출 없이 바로 답변을 반환하는 정상 경로를 누락했다. 다음 요청 본문뿐 아니라 반환된 실제 record_goal_brief 이벤트에서도 결과를 읽도록 진단기를 수정했다. 상태 기대값은 그대로다.',preliminaryReport:'logs/persona-pilot-round11/2026-09-16T08-18-22-291Z/results.json'},
  {caseId:'KR-100,US-95/unmeasured-contract',reason:'미측정 상태에 설명용 계약 객체가 남는 것은 정상이다. 객체 자체가 없다는 기대 대신 실제 검증기가 사용하는 제한이 unspecified이며 숫자 한도가 없는지 검사한다. 원문 보존을 오류로 세지 않는다.',preliminaryReport:'logs/persona-pilot-round11/2026-09-16T08-18-22-291Z/results.json'},
  {caseId:'alternating-weeks/draft-setup',reason:'격주 예산을 주간 정기안에 사용하지 않아야 한다는 안전 기준에서, 저장 경계의 capacity_requires_grounded_measurement 거절도 허용한다. 미해석 예산 저장 후 실행 거절 경로만 허용하던 기대를 수정했다. 해당 경로는 초안 검증 미도달로 별도 표시한다.',preliminaryReport:'logs/persona-pilot-round11/2026-09-16T08-18-22-291Z/results.json'},
]
